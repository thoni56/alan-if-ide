import * as path from 'path';
import * as fs from 'fs';
import { ExtensionContext, workspace, window, commands, languages, DiagnosticSeverity, StatusBarAlignment } from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions
} from 'vscode-languageclient/node';
import { play, onTerminalClosed } from './play';
import { resolveJava, missingJavaMessage } from './java';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    const jar = context.asAbsolutePath(path.join('server', 'alan-lsp.jar'));
    if (!fs.existsSync(jar)) {
        window.showErrorMessage(`Alan IF IDE: language server jar not found at ${jar}`);
        return;
    }

    // The configured JDK home, else the runtime bundled in the VSIX, else JAVA_HOME,
    // else PATH. Without a usable Java there is no language server at all, so say so
    // plainly rather than letting the client fail somewhere in the Output panel.
    const cfg = workspace.getConfiguration('alanif');
    const java = resolveJava(context.extensionPath, cfg.get<string>('java.home'));
    if (!java.ok) {
        window.showErrorMessage(missingJavaMessage(java), 'Open Settings').then(choice => {
            if (choice === 'Open Settings') {
                commands.executeCommand('workbench.action.openSettings', 'alanif.java.home');
            }
        });
        return;
    }
    if (java.warning) {
        window.showWarningMessage(java.warning);
    }
    const javaCmd = java.command;

    // Pass server-side config via env (same channel for compiler path + format style).
    const env = { ...process.env };
    const compilerPath = cfg.get<string>('compiler.path');
    if (compilerPath) {
        env.ALAN_COMPILER = compilerPath;
    }
    env.ALANIF_KEYWORD_CASE = cfg.get<string>('format.keywordCase') || 'off';
    const exec = { command: javaCmd, args: ['-jar', jar], options: { env } };
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

    context.subscriptions.push(
        commands.registerCommand('alanif.play', () => play()),
        window.onDidCloseTerminal(onTerminalClosed),
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
