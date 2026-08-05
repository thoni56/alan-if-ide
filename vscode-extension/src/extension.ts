import * as path from 'path';
import * as fs from 'fs';
import { ExtensionContext, workspace, window } from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    const jar = context.asAbsolutePath(path.join('server', 'alan-lsp.jar'));
    if (!fs.existsSync(jar)) {
        window.showErrorMessage(`Alan IDE: language server jar not found at ${jar}`);
        return;
    }

    // `java` from the configured JDK home, else PATH.
    const javaHome = workspace.getConfiguration('alan').get<string>('java.home');
    const javaCmd = javaHome ? path.join(javaHome, 'bin', 'java') : 'java';

    const serverOptions: ServerOptions = {
        run:   { command: javaCmd, args: ['-jar', jar] },
        debug: { command: javaCmd, args: ['-jar', jar] }
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'alan' }],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/*.alan')
        }
    };

    client = new LanguageClient('alan', 'Alan Language Server', serverOptions, clientOptions);
    client.start();
}

export function deactivate(): Thenable<void> | undefined {
    return client?.stop();
}
