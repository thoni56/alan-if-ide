import * as path from 'path';
import * as fs from 'fs';
import { ExtensionContext, commands, window } from 'vscode';
import { play, watchPlayTerminals } from './play';
import { JavaMissing, missingJavaMessage } from './java';
import { Environment, initEnvironment, onEnvironmentChanged } from './environment';
import { overriddenPathWarnings } from './toolchain';
import { createStatusItems, createPlayStatusItem, createRewrapKeyStatusItem } from './status';
import { locateCompiler, locateInterpreter, checkToolchain } from './locate';
import { ensureUtf8Sources } from './convert';
import { rewrapStringCommand, bindRewrapKeyCommand, registerRewrapAction } from './rewrap';
import { registerEncodingFixes } from './quickfix';
import { startLanguageClient, stopLanguageClient, restartWhenServerSettingsChange,
    syncServerCompiler } from './client';
import { initNotices, compilerNoticeSuppressed, suppressCompilerNotice } from './notices';

export function activate(context: ExtensionContext) {
    // Resolve Java and the Alan tools once, and put the answer on screen, BEFORE
    // anything is allowed to fail. Everything below can bail out; the status items
    // and the commands that fix them must survive that, or a broken setup becomes
    // an extension that silently does nothing.
    initNotices(context);
    const setup = initEnvironment(context);
    createStatusItems(context);
    createRewrapKeyStatusItem(context);
    registerEncodingFixes(context);
    registerRewrapAction(context);
    registerCommands(context);
    watchPlayTerminals(context);

    const jar = context.asAbsolutePath(path.join('server', 'alan-lsp.jar'));
    if (!fs.existsSync(jar)) {
        window.showErrorMessage(`Alan IF IDE: language server jar not found at ${jar}`);
        return;
    }
    if (!setup.java.ok) {
        reportUnusableJava(setup.java);
        return;
    }
    reportOverriddenPaths(setup);

    startLanguageClient(jar, setup.java, setup.compiler);
    createPlayStatusItem(context);
    context.subscriptions.push(
        restartWhenServerSettingsChange(),
        // The server holds the compiler it was started with, and nothing in the
        // configuration changes when that path stops being one -- an SDK moved or
        // newly installed, or the same global setting read from the other side of a
        // remote/local switch. So the server follows the RESOLVED toolchain, which
        // is re-resolved on every Play and every toolchain check.
        onEnvironmentChanged(env => syncServerCompiler(env.compiler)),
    );
    offerCompilerNotice(setup);

    // Settle the project's encoding before the author edits anything: a file shown
    // with replacement characters is one save away from losing its real ones. Not
    // awaited -- activation should not wait on a scan of the workspace.
    ensureUtf8Sources();
}

export function deactivate(): Thenable<void> | undefined {
    return stopLanguageClient();
}

function registerCommands(context: ExtensionContext): void {
    context.subscriptions.push(
        commands.registerCommand('alanif.play', () => play()),
        commands.registerCommand('alanif.locateCompiler', () => locateCompiler()),
        commands.registerCommand('alanif.locateInterpreter', () => locateInterpreter()),
        commands.registerCommand('alanif.checkToolchain', () => checkToolchain()),
        commands.registerCommand('alanif.convertSources', () => ensureUtf8Sources()),
        commands.registerCommand('alanif.rewrapString', () => rewrapStringCommand()),
        commands.registerCommand('alanif.bindRewrapKey', () => bindRewrapKeyCommand()),
    );
}

/**
 * The configured JDK home, else the runtime bundled in the VSIX, else JAVA_HOME,
 * else PATH. Without a usable Java there is no language server at all, so say so
 * plainly rather than letting the client fail somewhere in the Output panel.
 */
function reportUnusableJava(java: JavaMissing): void {
    errorWithSettingsLink(missingJavaMessage(java), 'alanif.java.home');
}

/**
 * A path setting that was set and then quietly stepped over: the tool works, so
 * without this nothing would ever reveal that the path the author deliberately
 * chose is not the one in use.
 */
function reportOverriddenPaths(setup: Environment): void {
    for (const warning of overriddenPathWarnings(setup)) {
        warnWithSettingsLink(warning, 'alanif');
    }
}

/**
 * Diagnostics and Play both need the toolchain, so a missing compiler is worth
 * saying once -- with the fix attached. The language status item now carries the
 * same state persistently, so an author who has seen it and chosen to work
 * without a compiler can stop being told on every window.
 */
function offerCompilerNotice(setup: Environment): void {
    if (setup.compiler.ok || compilerNoticeSuppressed()) {
        return;
    }
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

const OPEN_SETTINGS = 'Open Settings';

/**
 * A message with the way to fix it attached.
 *
 * <p>Two functions rather than one taking a severity: which of the two this is, is
 * the whole point of the call, and a boolean argument would hide it at the call site.
 */
function errorWithSettingsLink(message: string, setting: string): void {
    openSettingsIfChosen(window.showErrorMessage(message, OPEN_SETTINGS), setting);
}

function warnWithSettingsLink(message: string, setting: string): void {
    openSettingsIfChosen(window.showWarningMessage(message, OPEN_SETTINGS), setting);
}

function openSettingsIfChosen(choice: Thenable<string | undefined>, setting: string): void {
    choice.then(chosen => {
        if (chosen === OPEN_SETTINGS) {
            commands.executeCommand('workbench.action.openSettings', setting);
        }
    });
}
