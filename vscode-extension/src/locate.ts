import { window, workspace, commands, ConfigurationTarget, Uri } from 'vscode';
import { probeVersion, resolveCompiler, resolveArun, missingCompilerMessage, missingArunMessage } from './toolchain';

/**
 * Browse for the Alan compiler and remember it.
 *
 * The setting has always existed, but only as a text box: an author had to know
 * the absolute path and type it correctly, which is the very first thing they do
 * after installing and so the worst possible place for friction.
 *
 * The chosen file is verified by running it, so picking the wrong thing says so
 * immediately rather than failing later as mysteriously absent diagnostics.
 */
export async function locateCompiler(): Promise<void> {
    const picked = await window.showOpenDialog({
        canSelectMany: false,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: 'Use this Alan compiler',
        title: 'Locate the Alan compiler (alan)',
        defaultUri: defaultSearchLocation(),
    });
    if (!picked || picked.length === 0) {
        return;                                  // cancelled; say nothing
    }

    const chosen = picked[0].fsPath;
    const version = probeVersion(chosen);
    if (version === undefined) {
        const retry = await window.showErrorMessage(
            `That does not run as an Alan compiler: ${chosen}. ` +
            'Pick the "alan" executable, usually in the bin/ folder of an Alan SDK.',
            'Choose Again');
        if (retry === 'Choose Again') {
            await locateCompiler();
        }
        return;
    }

    await workspace.getConfiguration('alanif')
        .update('compiler.path', chosen, ConfigurationTarget.Global);

    // The server receives the compiler path at launch, so it needs a restart to
    // pick this up -- the same constraint as the keyword-case setting.
    const choice = await window.showInformationMessage(
        `Alan IF: using Alan ${version} at ${chosen}. Reload to enable diagnostics.`,
        'Reload');
    if (choice === 'Reload') {
        commands.executeCommand('workbench.action.reloadWindow');
    }
}

/**
 * Report what the extension can and cannot find. Every "missing" offers the fix
 * rather than just naming the problem.
 */
export async function checkToolchain(): Promise<void> {
    const configured = workspace.getConfiguration('alanif').get<string>('compiler.path');
    const compiler = resolveCompiler(configured);
    const arun = resolveArun(compiler.ok ? compiler.command : undefined);

    if (!compiler.ok) {
        const choice = await window.showWarningMessage(
            missingCompilerMessage(compiler), 'Locate Compiler…');
        if (choice === 'Locate Compiler…') {
            await locateCompiler();
        }
        return;
    }

    if (!arun.ok) {
        window.showWarningMessage(missingArunMessage(arun));
        return;
    }

    window.showInformationMessage(
        `Alan IF: compiler ${compiler.version} (from ${compiler.source}) and ` +
        `arun ${arun.version} (from ${arun.source}). Everything is in place.`);
}

/** Start the file dialog somewhere useful rather than at the last-used folder. */
function defaultSearchLocation(): Uri | undefined {
    const configured = workspace.getConfiguration('alanif').get<string>('compiler.path');
    if (configured && configured.trim()) {
        return Uri.file(configured.trim());
    }
    return undefined;
}
