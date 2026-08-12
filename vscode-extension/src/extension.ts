import * as path from 'path';
import * as fs from 'fs';
import { ExtensionContext, workspace, window, commands } from 'vscode';
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
        window.showErrorMessage(`Alan IDE: language server jar not found at ${jar}`);
        return;
    }

    // `java` from the configured JDK home, else PATH.
    const cfg = workspace.getConfiguration('alan');
    const javaHome = cfg.get<string>('java.home');
    const javaCmd = javaHome ? path.join(javaHome, 'bin', 'java') : 'java';

    // Pass the Alan compiler path to the server (for diagnostics) via env.
    const env = { ...process.env };
    const compilerPath = cfg.get<string>('compiler.path');
    if (compilerPath) {
        env.ALAN_COMPILER = compilerPath;
    }
    const exec = { command: javaCmd, args: ['-jar', jar], options: { env } };
    const serverOptions: ServerOptions = { run: exec, debug: exec };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'alan' }],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/*.alan')
        }
    };

    client = new LanguageClient('alan', 'Alan Language Server', serverOptions, clientOptions);
    client.start();

    context.subscriptions.push(
        commands.registerCommand('alan.play', () => play()),
        window.onDidCloseTerminal(onTerminalClosed)
    );
}

export function deactivate(): Thenable<void> | undefined {
    return client?.stop();
}
