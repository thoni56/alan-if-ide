import * as path from 'path';
import * as fs from 'fs';
import { ExtensionContext, workspace, window, commands, languages, DiagnosticSeverity, StatusBarAlignment } from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions
} from 'vscode-languageclient/node';
import { play, onTerminalClosed } from './play';
import { missingJavaMessage } from './java';
import { initEnvironment } from './environment';
import { createStatusItems } from './status';
import { locateCompiler, locateInterpreter, checkToolchain } from './locate';
import { ensureUtf8Sources } from './convert';
import { registerEncodingFixes } from './quickfix';
import { initNotices, compilerNoticeSuppressed, suppressCompilerNotice } from './notices';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    // Resolve Java and the Alan tools once, and put the answer on screen, BEFORE
    // anything is allowed to fail. Everything below can bail out; the status items
    // and the commands that fix them must survive that, or a broken setup becomes
    // an extension that silently does nothing.
    initNotices(context);
    const setup = initEnvironment(context);
    createStatusItems(context);
    registerEncodingFixes(context);
    context.subscriptions.push(
        commands.registerCommand('alanif.play', () => play()),
        commands.registerCommand('alanif.locateCompiler', () => locateCompiler()),
        commands.registerCommand('alanif.locateInterpreter', () => locateInterpreter()),
        commands.registerCommand('alanif.checkToolchain', () => checkToolchain()),
        commands.registerCommand('alanif.convertSources', () => ensureUtf8Sources()),
        window.onDidCloseTerminal(onTerminalClosed),
    );

    const jar = context.asAbsolutePath(path.join('server', 'alan-lsp.jar'));
    if (!fs.existsSync(jar)) {
        window.showErrorMessage(`Alan IF IDE: language server jar not found at ${jar}`);
        return;
    }

    // The configured JDK home, else the runtime bundled in the VSIX, else JAVA_HOME,
    // else PATH. Without a usable Java there is no language server at all, so say so
    // plainly rather than letting the client fail somewhere in the Output panel.
    if (!setup.java.ok) {
        window.showErrorMessage(missingJavaMessage(setup.java), 'Open Settings').then(choice => {
            if (choice === 'Open Settings') {
                commands.executeCommand('workbench.action.openSettings', 'alanif.java.home');
            }
        });
        return;
    }
    // A path setting that was set and then quietly stepped over: the tool works, so
    // without this nothing would ever reveal that the path the author deliberately
    // chose is not the one in use.
    for (const warning of [
        setup.java.warning,
        setup.compiler.ok ? setup.compiler.warning : undefined,
        setup.arun.ok ? setup.arun.warning : undefined,
    ]) {
        if (warning) {
            window.showWarningMessage(warning, 'Open Settings').then(choice => {
                if (choice === 'Open Settings') {
                    commands.executeCommand('workbench.action.openSettings', 'alanif');
                }
            });
        }
    }

    // Pass server-side config via env (same channel for compiler path + format style).
    const cfg = workspace.getConfiguration('alanif');
    const env = { ...process.env };
    // Hand the server a RESOLVED compiler rather than the setting verbatim: with the
    // setting empty the server would fall back to bare `alan`, which misses an SDK
    // installed in a standard place but not on PATH -- a common case now that the
    // SDK ships as an unpacked tarball.
    if (setup.compiler.ok) {
        env.ALAN_COMPILER = setup.compiler.command;
    }
    env.ALANIF_KEYWORD_CASE = cfg.get<string>('format.keywordCase') || 'off';
    const exec = { command: setup.java.command, args: ['-jar', jar], options: { env } };
    const serverOptions: ServerOptions = { run: exec, debug: exec };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'alanif' }],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/*.alan')
        },
        middleware: {
            // Format Document silently does nothing when the file has a syntax error
            // (the parse tree is partial, so re-indenting could misplace lines). Catch
            // that here -- for every Format path (keybinding, menu, palette) -- and tell
            // the user why. Only SYNTAX errors block: semantic/compiler errors parse
            // fine, so those files still format.
            provideDocumentFormattingEdits: (document, options, token, next) => {
                const syntaxErrors = languages.getDiagnostics(document.uri).filter(d =>
                    d.severity === DiagnosticSeverity.Error && codeOf(d).includes('Diagnostic.Syntax'));
                if (syntaxErrors.length > 0) {
                    const line = syntaxErrors[0].range.start.line + 1;
                    window.showWarningMessage(
                        `Alan IF: not formatted — syntax error on line ${line}. Fix it, then format again.`);
                    return [];
                }
                return next(document, options, token);
            }
        }
    };

    client = new LanguageClient('alanif', 'Alan IF Language Server', serverOptions, clientOptions);
    client.start();

    // A persistent, always-visible Play affordance (the editor-title icon is easy
    // to miss). Shown only while an Alan file is the active editor.
    const playStatus = window.createStatusBarItem(StatusBarAlignment.Left, 100);
    playStatus.command = 'alanif.play';
    playStatus.text = '$(play) Play';
    playStatus.tooltip = 'Compile and play this Alan adventure';
    const updatePlayStatus = () => {
        if (window.activeTextEditor?.document.languageId === 'alanif') {
            playStatus.show();
        } else {
            playStatus.hide();
        }
    };
    updatePlayStatus();

    // The keyword-case style is passed to the server at launch (via env), so a
    // change only takes effect after the server restarts -- offer to reload.
    const reloadOnChange = workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('alanif.format.keywordCase')) {
            window.showInformationMessage(
                'Alan IF: reload the window for the new keyword-case setting to take effect.',
                'Reload'
            ).then(choice => {
                if (choice === 'Reload') {
                    commands.executeCommand('workbench.action.reloadWindow');
                }
            });
        }
    });

    // Diagnostics and Play both need the toolchain, so a missing compiler is worth
    // saying once -- with the fix attached. The language status item now carries the
    // same state persistently, so an author who has seen it and chosen to work
    // without a compiler can stop being told on every window.
    if (!setup.compiler.ok && !compilerNoticeSuppressed()) {
        window.showWarningMessage(
            'Alan IF IDE could not find the Alan compiler, so diagnostics and Play ' +
            'are unavailable. Editing, navigation and formatting still work.',
            'Locate Compiler…', "Don't Show Again"
        ).then(choice => {
            if (choice === 'Locate Compiler…') {
                locateCompiler();
            } else if (choice === "Don't Show Again") {
                suppressCompilerNotice();
            }
        });
    }

    // Settle the project's encoding before the author edits anything: a file shown
    // with replacement characters is one save away from losing its real ones. Not
    // awaited -- activation should not wait on a scan of the workspace.
    ensureUtf8Sources();

    context.subscriptions.push(
        playStatus,
        window.onDidChangeActiveTextEditor(updatePlayStatus),
        reloadOnChange
    );
}

export function deactivate(): Thenable<void> | undefined {
    return client?.stop();
}

/** A diagnostic's code as a string (it may be a string, number, or {value, target}). */
function codeOf(d: { code?: string | number | { value: string | number } }): string {
    const c = d.code;
    if (c === undefined || c === null) { return ''; }
    if (typeof c === 'object') { return String(c.value); }
    return String(c);
}
