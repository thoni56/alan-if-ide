import { Disposable, DiagnosticSeverity, Uri, languages, window, workspace } from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions
} from 'vscode-languageclient/node';
import { JavaFound } from './java';
import { ToolResult, resolveCompiler } from './toolchain';
import { serverEnvironment } from './serverConfig';
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
let client: LanguageClient | undefined;

export function startLanguageClient(jar: string, java: JavaFound, compiler: ToolResult): void {
    client = new LanguageClient('alanif', 'Alan IF Language Server',
        serverOptions(jar, java, compiler), clientOptions());
    client.start();
}

export function stopLanguageClient(): Thenable<void> | undefined {
    return client?.stop();
}

/**
 * Settings the SERVER is told about at startup. Restarting the client is enough to
 * deliver them -- a whole window reload was never necessary, and asking for one is
 * asking to be ignored, which left diagnostics silently dead for anyone who
 * dismissed the prompt.
 */
export function restartWhenServerSettingsChange(): Disposable {
    return workspace.onDidChangeConfiguration(async e => {
        if (e.affectsConfiguration('alanif.compiler.path')
            || e.affectsConfiguration('alanif.format.keywordCase')) {
            await restartServer();
        }
    });
}

async function restartServer(): Promise<void> {
    if (!client) {
        // Unreachable as activate wires it: this subscription is registered only
        // after the client has started. Not silent if that ever stops being true --
        // there is simply no server to re-tell, and no fault to report about one.
        return;
    }
    try {
        await client.stop();
        await client.start();
        reportServerProblem(undefined);
    } catch (e) {
        reportFailedRestart(e);
    }
}

/**
 * A failed restart is much worse than "no worse than before", and in the one case
 * that matters most: the server the author is trying to fix was started WITHOUT a
 * compiler, so surviving the restart means it keeps having none -- an empty Problems
 * panel for the rest of the session, while every setup surface reports a compiler
 * correctly found, because those run in the extension host and never asked the
 * server. Exactly that cost a Mac author a working install until an update happened
 * to restart the host for unrelated reasons. So: say it, and keep saying it.
 */
function reportFailedRestart(e: unknown): void {
    client?.outputChannel?.appendLine(
        'Alan IF IDE could not restart the language server after a '
        + `setting changed (${e}). The running server still has the settings it `
        + 'started with, so compiler diagnostics may be missing or stale. '
        + 'Reload the window to apply them.');
    reportServerProblem('The language server did not restart, so it still has '
        + 'its old settings — reload the window.');
}

/**
 * The server is told its configuration BOTH ways, and that is not belt-and-braces --
 * the environment is the half that actually works today. #11 replaced it with
 * initializationOptions alone, which the server never receives, and diagnostics were
 * dead from 0.7.1 for anyone whose compiler was not on PATH. It went unnoticed
 * because on a developer's machine `alan` IS on PATH, so the client's fallback and
 * the server's fallback produce the same answer and nothing looks broken.
 * initializationOptions is sent anyway, so that whenever the server is taught to read
 * it, this client is already speaking the intended channel.
 */
function serverOptions(jar: string, java: JavaFound, compiler: ToolResult): ServerOptions {
    const cfg = workspace.getConfiguration('alanif');
    const exec = {
        command: java.command,
        args: ['-jar', jar],
        options: { env: serverEnvironment(process.env, compiler, cfg.get<string>('format.keywordCase')) },
    };
    return { run: exec, debug: exec };
}

function clientOptions(): LanguageClientOptions {
    return {
        documentSelector: [{ scheme: 'file', language: 'alanif' }],
        // Configuration travels over LSP, not as environment variables the launcher
        // sets. That is what keeps the server usable from Emacs, Neovim or Helix
        // without any of them knowing how this extension happens to start it.
        //
        // The compiler is passed RESOLVED rather than as the raw setting: left empty
        // the server would fall back to bare `alan`, which misses an SDK installed in
        // a standard place but not on PATH -- common, now that it ships as a tarball.
        // A FUNCTION, not an object: it is evaluated each time the client starts, so a
        // restart picks up settings that changed since. As a fixed object it captured
        // whatever was true at activation, which is how an author could point at their
        // compiler with Locate and still get no diagnostics -- the client re-resolves
        // on every Play, but the server had been told once and never again.
        initializationOptions: () => {
            const current = workspace.getConfiguration('alanif');
            const found = resolveCompiler(current.get<string>('compiler.path'));
            return {
                compilerPath: found.ok ? found.command : undefined,
                keywordCase: current.get<string>('format.keywordCase') || 'off',
            };
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
