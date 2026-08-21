import { window, workspace, commands, ConfigurationTarget, QuickPickItem, Uri } from 'vscode';
import { probeVersion } from './toolchain';
import { Environment, getEnvironment, refreshEnvironment } from './environment';
import { MINIMUM_JAVA } from './java';
import * as path from 'path';

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
    const chosen = await browseFor('alan', 'Locate the Alan compiler (alan)', 'Use this Alan compiler');
    if (!chosen) {
        return;
    }

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
 * Browse for arun and remember it.
 *
 * Unlike the compiler this needs no reload: arun is spawned by Play, in the
 * client, and is never handed to the language server.
 */
export async function locateInterpreter(): Promise<void> {
    const chosen = await browseFor('arun', 'Locate the Alan interpreter (arun)', 'Use this interpreter');
    if (!chosen) {
        return;
    }

    const version = probeVersion(chosen);
    if (version === undefined) {
        const retry = await window.showErrorMessage(
            `That does not run as the Alan interpreter: ${chosen}. ` +
            'Pick the "arun" executable, usually next to the compiler in an Alan SDK.',
            'Choose Again');
        if (retry === 'Choose Again') {
            await locateInterpreter();
        }
        return;
    }

    await workspace.getConfiguration('alanif')
        .update('arun.path', chosen, ConfigurationTarget.Global);
    window.showInformationMessage(`Alan IF: using arun ${version} at ${chosen}. Play is ready.`);
}

/**
 * Report what the extension can and cannot find -- all of it, at once.
 *
 * A quick pick rather than a notification: three components with their versions
 * and origins do not fit in a toast, and every row here is a live control. The
 * previous version reported the first problem and returned, so an author missing
 * two things fixed one and was ambushed by the other.
 */
export async function checkToolchain(): Promise<void> {
    const env = refreshEnvironment();
    const items = [javaItem(env), compilerItem(env), arunItem(env)];
    const wanting = items.filter(i => i.attention).length;

    const pick = await window.showQuickPick(items, {
        title: 'Alan IF — setup',
        placeHolder: wanting === 0
            ? 'Everything is in place. Select an entry to change it.'
            : `${wanting} of 3 need attention. Select an entry to fix it.`,
        matchOnDetail: true,
    });
    await pick?.run();
}

/** A row in the setup check: what it is, what we found, and what to do about it. */
interface SetupItem extends QuickPickItem {
    attention: boolean;
    run(): Promise<void> | void;
}

function javaItem(env: Environment): SetupItem {
    if (env.java.ok) {
        return {
            label: env.java.warning ? '$(warning) Java' : '$(check) Java',
            description: String(env.java.version),
            detail: env.java.warning ?? `${env.java.command} — ${env.java.source}`,
            attention: env.java.warning !== undefined,
            run: () => openSetting('alanif.java.home'),
        };
    }
    const old = env.java.tooOld[0];
    return {
        label: '$(error) Java',
        description: old ? `${old.version} — too old` : 'not found',
        detail: `Java ${MINIMUM_JAVA}+ is required; the language server cannot run without it`,
        attention: true,
        run: () => openSetting('alanif.java.home'),
    };
}

function compilerItem(env: Environment): SetupItem {
    if (env.compiler.ok) {
        return {
            label: env.compiler.warning ? '$(warning) Compiler' : '$(check) Compiler',
            description: env.compiler.version,
            detail: env.compiler.warning ?? `${env.compiler.command} — ${env.compiler.source}`,
            attention: env.compiler.warning !== undefined,
            run: () => openSetting('alanif.compiler.path'),
        };
    }
    return {
        label: '$(warning) Compiler',
        description: 'not found',
        detail: `Diagnostics and Play unavailable. Looked in: ${env.compiler.tried.join(', ')}`,
        attention: true,
        run: locateCompiler,
    };
}

function arunItem(env: Environment): SetupItem {
    if (env.arun.ok) {
        return {
            label: env.arun.warning ? '$(warning) Interpreter' : '$(check) Interpreter',
            description: env.arun.version,
            detail: env.arun.warning ?? `${env.arun.command} — ${env.arun.source}`,
            attention: env.arun.warning !== undefined,
            run: () => openSetting('alanif.arun.path'),
        };
    }
    return {
        label: '$(warning) Interpreter',
        description: 'not found',
        detail: `Play cannot start the game. Looked in: ${env.arun.tried.join(', ')}`,
        attention: true,
        run: locateInterpreter,
    };
}

function openSetting(id: string): void {
    commands.executeCommand('workbench.action.openSettings', id);
}

/** One file dialog, opened somewhere useful rather than at the last-used folder. */
async function browseFor(tool: string, title: string, openLabel: string): Promise<string | undefined> {
    const picked = await window.showOpenDialog({
        canSelectMany: false,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel,
        title,
        defaultUri: defaultSearchLocation(tool),
    });
    return picked?.[0]?.fsPath;
}

/**
 * Start in the bin/ directory of whatever we already know about: an author who is
 * pointing us at arun almost always has the compiler beside it, and vice versa.
 */
function defaultSearchLocation(tool: string): Uri | undefined {
    const env = getEnvironment();
    const known = tool === 'arun'
        ? (env.compiler.ok ? env.compiler.command : undefined)
        : (env.arun.ok ? env.arun.command : undefined);
    if (known && (known.includes('/') || known.includes('\\'))) {
        return Uri.file(path.dirname(known));
    }
    const configured = workspace.getConfiguration('alanif').get<string>(
        tool === 'arun' ? 'arun.path' : 'compiler.path');
    return configured && configured.trim() ? Uri.file(configured.trim()) : undefined;
}
