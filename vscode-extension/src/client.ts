import { Disposable, DiagnosticSeverity, OutputChannel, Uri, languages, window, workspace } from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions
} from 'vscode-languageclient/node';
import { JavaFound } from './java';
import { ToolResult } from './toolchain';
import { serverEnvironment, compilerToldTo, serverNeedsRestart } from './serverConfig';
import { reportServerProblem } from './status';
import { isSyntaxDiagnostic } from './diagnostics';

/**
 * Owning the language client: starting it, telling it its configuration, and
 * restarting it when that configuration changes.
 *
 * <p>Java is taken as a JavaFound rather than the whole Environment so that "we
 * already know Java works" is a type here instead of a comment: there is no language
 * server at all without it, and the caller has to have said so before it can call in.
 */

/** What it takes to launch the server again, kept so a restart can rebuild it all. */
interface Launch {
    jar: string;
    java: JavaFound;
}

let client: LanguageClient | undefined;
let launch: Launch | undefined;
/** The compiler the RUNNING server was told about; what a resync compares against. */
let told: ToolResult | undefined;
/** Ours, not the client's -- see startServer. */
let output: OutputChannel | undefined;

export function startLanguageClient(jar: string, java: JavaFound, compiler: ToolResult): void {
    launch = { jar, java };
    void startServer(launch, compiler);
}

export function stopLanguageClient(): Thenable<void> | undefined {
    return client?.stop();
}

/**
 * Build a NEW client for each run of the server, and start it.
 *
 * <p>The whole client is rebuilt rather than restarted, because ServerOptions -- and
 * with it ALAN_COMPILER -- is a plain object fixed when the client was constructed.
 * `client.stop(); client.start()` reuses it, so a server restarted after the compiler
 * moved came back up carrying the environment from ACTIVATION. That was survivable
 * only while initializationOptions disagreed with it in the right direction: when
 * re-resolution finds nothing the options say so by omission, the server falls back to
 * the environment, and the stale path wins. Rebuilding means one resolved answer feeds
 * both channels and they cannot disagree.
 *
 * <p>The output channel is created here and shared by every client, because a client
 * makes its own otherwise -- so each restart would add another "Alan IF Language
 * Server" to the Output dropdown, and the log of what just went wrong would be split
 * across them.
 */
function startServer(where: Launch, compiler: ToolResult): Promise<void> {
    told = compiler;
    client = new LanguageClient('alanif', 'Alan IF Language Server',
        serverOptions(where, compiler), clientOptions(compiler));
    return client.start();
}

/**
 * Settings the SERVER is told about at startup. Restarting the client is enough to
 * deliver them -- a whole window reload was never necessary, and asking for one is
 * asking to be ignored, which left diagnostics silently dead for anyone who
 * dismissed the prompt.
 *
 * <p>The compiler path is NOT watched here. It arrives through syncServerCompiler
 * instead, which reacts to the resolved compiler changing rather than to the setting
 * changing -- a strictly larger set of events, and one that does not fire twice for
 * the same edit.
 */
export function restartWhenServerSettingsChange(): Disposable {
    return workspace.onDidChangeConfiguration(async e => {
        if (e.affectsConfiguration('alanif.format.keywordCase') && told) {
            await restartServer(told);
        }
    });
}

/**
 * Point the server at the compiler as it is NOW, restarting it if that is not the one
 * it was started with.
 *
 * <p>This is the half that "restart when the setting changes" cannot cover. A path
 * stops working without anyone editing anything: the SDK is moved, or installed after
 * the window was opened, or -- the case that cost half an hour to diagnose -- the same
 * global alanif.compiler.path is read from the other side of a remote/local switch,
 * where a Windows path is not a file. The server logs `Could not run the Alan compiler
 * ... No such file`, the Problems panel is empty, and every setup surface in the
 * window cheerfully reports a compiler correctly found, because those run in the
 * extension host and never asked the server.
 *
 * <p>Wired to the environment's change event, so it fires wherever the toolchain is
 * re-resolved: on every Play, on Check Toolchain, and when a path setting is edited.
 * Those are precisely the moments an author is asking why nothing works.
 */
export function syncServerCompiler(compiler: ToolResult): void {
    if (!client || !told || !serverNeedsRestart(compilerToldTo(told), compiler)) {
        return;
    }
    log(`The Alan compiler is now ${compilerToldTo(compiler) ?? 'not found'}, but the `
        + `language server was started with ${compilerToldTo(told) ?? 'none'}. `
        + 'Restarting it so diagnostics use the compiler that is actually there.');
    void restartServer(compiler);
}

async function restartServer(compiler: ToolResult): Promise<void> {
    const where = launch;
    if (!client || !where) {
        // Unreachable as activate wires it: these subscriptions are registered only
        // after the client has started. Not silent if that ever stops being true --
        // there is simply no server to re-tell, and no fault to report about one.
        return;
    }
    await stopQuietly(client);
    try {
        await startServer(where, compiler);
        reportServerProblem(undefined);
    } catch (e) {
        reportFailedRestart(e);
    }
}

/**
 * How long to wait for the old server to go away. The library's own default is two
 * seconds, which this server routinely cannot meet: the LSP shutdown queues behind
 * whatever validation is in flight, and ours can be sitting inside a 60-second wait on
 * the Alan compiler as a child process. The number is a comfort, not a guarantee --
 * see stopQuietly for what happens when it is not enough.
 */
const STOP_TIMEOUT_MS = 5000;

/**
 * Stop the old server, and do not let failing to stop it stop us.
 *
 * <p>A slow shutdown used to cost the author the whole restart: stop() rejected with
 * "Stopping the server timed out", the exception skipped the start, and they were left
 * with no server and a message telling them to reload the window -- for a JVM that
 * exited cleanly a moment later on its own. That was a necessary evil only while a
 * restart reused one client object, where starting again over a half-stopped client
 * would have been the worse bug.
 *
 * <p>Rebuilding the client removes the necessity, and the library makes it safe:
 * BaseLanguageClient.shutdown cleans up and moves to Stopped in a `finally`, so a
 * timed-out stop still leaves a client whose diagnostics are disposed and whose
 * connection is gone. Nothing of the old one can reach the editor afterwards. What we
 * lost by waiting was only the waiting.
 */
async function stopQuietly(old: LanguageClient): Promise<void> {
    try {
        await old.stop(STOP_TIMEOUT_MS);
    } catch (e) {
        log('The previous language server did not shut down within '
            + `${STOP_TIMEOUT_MS / 1000} seconds (${e}), which is usual when it was busy `
            + 'compiling. Starting the new one anyway; the old process exits on its own.');
    }
}

/**
 * The new server would not START -- the only failure left that costs the author
 * anything, and it costs them everything: there is now no server at all.
 *
 * <p>It matters most in the case that brought them here. The server they are trying to
 * fix was started WITHOUT a compiler, so a restart that does not happen means an empty
 * Problems panel for the rest of the session, while every setup surface reports a
 * compiler correctly found -- those run in the extension host and never asked the
 * server. Exactly that cost a Mac author a working install until an update happened to
 * restart the host for unrelated reasons. So: say it, and keep saying it.
 */
function reportFailedRestart(e: unknown): void {
    log('Alan IF IDE could not start the language server after a setting changed '
        + `(${e}), so there is no server running: no diagnostics, no navigation and no `
        + 'formatting until the window is reloaded.');
    reportServerProblem('The language server did not start — reload the window.');
}

/** The shared channel, made on first use so no window pays for one it never shows. */
function channel(): OutputChannel {
    if (!output) {
        output = window.createOutputChannel('Alan IF Language Server');
    }
    return output;
}

function log(message: string): void {
    channel().appendLine(`[alan-if-ide] ${message}`);
}

/**
 * The server is told its configuration BOTH ways, and both are live: it reads
 * initializationOptions off the wire (AlanServerExtension), and falls back to the
 * environment when a launcher sent none.
 *
 * <p>The environment half is kept because #11 removed it, leaving initializationOptions
 * alone at a time when the server did not yet read them, and diagnostics were dead from
 * 0.7.1 for anyone whose compiler was not on PATH. It went unnoticed because on a
 * developer's machine `alan` IS on PATH, so the client's fallback and the server's
 * fallback produce the same answer and nothing looks broken.
 *
 * <p>Both halves are now built from the SAME ToolResult, on every start. They used not
 * to be: the environment was fixed at activation while the options re-resolved, so a
 * server restarted after the compiler moved got a fresh option and a stale variable --
 * and when the fresh answer was "nothing found", the option was omitted and the stale
 * variable won.
 */
function serverOptions(where: Launch, compiler: ToolResult): ServerOptions {
    const cfg = workspace.getConfiguration('alanif');
    const exec = {
        command: where.java.command,
        args: ['-jar', where.jar],
        options: { env: serverEnvironment(process.env, compiler, cfg.get<string>('format.keywordCase')) },
    };
    return { run: exec, debug: exec };
}

function clientOptions(compiler: ToolResult): LanguageClientOptions {
    return {
        documentSelector: [{ scheme: 'file', language: 'alanif' }],
        outputChannel: channel(),
        // Configuration travels over LSP, not as environment variables the launcher
        // sets. That is what keeps the server usable from Emacs, Neovim or Helix
        // without any of them knowing how this extension happens to start it.
        //
        // The compiler is passed RESOLVED rather than as the raw setting: left empty
        // the server would fall back to bare `alan`, which misses an SDK installed in
        // a standard place but not on PATH -- common, now that it ships as a tarball.
        // It is the SAME ToolResult that built the environment above, rather than a
        // second resolution of its own: two resolutions can disagree, and when they
        // did the loser was the author -- an omitted option let the server keep a
        // stale ALAN_COMPILER from activation. One answer, both channels, every start.
        initializationOptions: {
            compilerPath: compilerToldTo(compiler),
            keywordCase: workspace.getConfiguration('alanif').get<string>('format.keywordCase') || 'off',
        },
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/*.alan')
        },
        middleware: {
            // Caught here, in the one place every Format path goes through --
            // keybinding, menu and palette alike.
            provideDocumentFormattingEdits: (document, options, token, next) => {
                const blocking = firstSyntaxErrorLine(document.uri);
                if (blocking !== undefined) {
                    warnFormattingBlocked(blocking);
                    return [];
                }
                return next(document, options, token);
            }
        }
    };
}

/** The 1-based line of the first syntax error in a document, if it has one. */
function firstSyntaxErrorLine(uri: Uri): number | undefined {
    const syntax = languages.getDiagnostics(uri).filter(d =>
        d.severity === DiagnosticSeverity.Error && isSyntaxDiagnostic(d));
    return syntax.length > 0 ? syntax[0].range.start.line + 1 : undefined;
}

/** Format Document would otherwise silently do nothing. Say why, and where. */
function warnFormattingBlocked(line: number): void {
    window.showWarningMessage(
        `Alan IF: not formatted — syntax error on line ${line}. Fix it, then format again.`);
}
