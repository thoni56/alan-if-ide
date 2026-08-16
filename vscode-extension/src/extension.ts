import * as path from 'path';
import * as fs from 'fs';
import { ExtensionContext, workspace, window, commands, StatusBarAlignment } from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions
} from 'vscode-languageclient/node';
import { play, onTerminalClosed } from './play';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    const jar = context.asAbsolutePath(path.join('server', 'alan-lsp.jar'));
    if (!fs.existsSync(jar)) {
        window.showErrorMessage(`Alan IF IDE: language server jar not found at ${jar}`);
        return;
    }

    // `java` from the configured JDK home, else PATH.
    const cfg = workspace.getConfiguration('alanif');
    const javaHome = cfg.get<string>('java.home');
    const javaCmd = javaHome ? path.join(javaHome, 'bin', 'java') : 'java';

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
