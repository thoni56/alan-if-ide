import * as path from 'path';
import * as fs from 'fs';
import { workspace, window, env, Uri, ExtensionContext, Terminal, commands } from 'vscode';
import { shellFrom, playCommand } from './shell';
import { missingCompilerMessage, missingArunMessage } from './toolchain';
import { refreshTools } from './environment';

let playTerminal: Terminal | undefined;

/**
 * Compile the project's main and launch the compiled game in an interactive
 * integrated terminal -- the Alan play-test loop (edit -> compile -> play).
 *
 * The build and the play run as one shell line, `alan ... && arun ...`, in the
 * main's own directory: the author sees compiler output, then the game boots; a
 * compile error short-circuits the && so the interpreter never starts (the errors
 * are also already in the Problems panel via the language server).
 *
 * This is the deliberately-thin VS Code-only first cut. The "which main / which
 * flags" brain belongs in the server/descriptor eventually (so Emacs/Neovim share
 * it), but only the client can host an interactive terminal, so Play splits there.
 */
export async function play(): Promise<void> {
    const main = await resolveMain();
    if (!main) {
        window.showErrorMessage(
            'Alan: no .alan main file found to play. Open the main .alan file, ' +
            'or set "alanif.mainFile" in your settings.');
        return;
    }

    // Build what the author sees: flush unsaved edits first (imports are read from
    // disk by the compiler, so they must be saved too).
    await workspace.saveAll(false);

    // Play is the loudest failure if the toolchain is missing, so resolve properly
    // and say what is wrong here rather than letting the terminal print
    // "alan: command not found" and leaving the author to interpret it.
    //
    // Re-resolve rather than trusting the cache: an author who has just been told
    // the compiler is missing may well have installed one, and Play is exactly when
    // they would try again. This also republishes the state to the status items.
    const setup = refreshTools();
    if (!setup.compiler.ok) {
        const choice = await window.showErrorMessage(
            missingCompilerMessage(setup.compiler), 'Locate Compiler…');
        if (choice === 'Locate Compiler…') {
            await commands.executeCommand('alanif.locateCompiler');
        }
        return;
    }
    const compiler = setup.compiler.command;

    if (!setup.arun.ok) {
        const choice = await window.showErrorMessage(
            missingArunMessage(setup.arun), 'Locate Interpreter…');
        if (choice === 'Locate Interpreter…') {
            await commands.executeCommand('alanif.locateInterpreter');
        }
        return;
    }
    const interpreter = setup.arun.command;

    const dir = path.dirname(main.fsPath);
    const mainName = path.basename(main.fsPath);
    const a3c = path.basename(main.fsPath, path.extname(main.fsPath)) + '.a3c';

    // Mirror the diagnostics compile flags, minus -ide (we want human-readable
    // build output in the terminal, not the machine format).
    const command = playCommand(shellFrom(env.shell, process.platform),
            compiler, mainName, interpreter, a3c);

    // A fresh terminal per Play: disposing any previous one kills a still-running
    // game and resets the cwd, giving a clean build-and-restart each time.
    playTerminal?.dispose();
    playTerminal = window.createTerminal({ name: 'Alan IF Play', cwd: dir });
    playTerminal.show(true);
    playTerminal.sendText(command);
}

/**
 * Play's own plumbing, not the extension's: a closed terminal ends that run.
 */
export function watchPlayTerminals(context: ExtensionContext): void {
    context.subscriptions.push(window.onDidCloseTerminal(onTerminalClosed));
}

/** Forget the terminal once the user closes it, so the next Play makes a new one. */
function onTerminalClosed(closed: Terminal): void {
    if (closed === playTerminal) {
        playTerminal = undefined;
    }
}

/**
 * Which file to compile-and-play:
 *   1. an explicit `alanif.mainFile` (absolute, or relative to its workspace folder);
 *   2. else the focused editor if it is itself a .alan (authors keep several .alan
 *      as alternate start points -- the focused one wins);
 *   3. else the first .alan beside the focused file (playing from an included .i);
 *   4. else the first .alan anywhere in the workspace.
 */
async function resolveMain(): Promise<Uri | undefined> {
    const cfg = workspace.getConfiguration('alanif');
    const explicit = (cfg.get<string>('mainFile') || '').trim();
    if (explicit) {
        const uri = path.isAbsolute(explicit)
            ? Uri.file(explicit)
            : resolveInWorkspace(explicit);
        if (uri && fs.existsSync(uri.fsPath)) {
            return uri;
        }
    }

    const active = window.activeTextEditor?.document;
    if (active && active.uri.scheme === 'file') {
        if (active.fileName.toLowerCase().endsWith('.alan')) {
            return active.uri;
        }
        const beside = firstAlanIn(path.dirname(active.uri.fsPath));
        if (beside) {
            return Uri.file(beside);
        }
    }

    const hits = await workspace.findFiles('**/*.alan', '**/node_modules/**', 1);
    return hits[0];
}

function firstAlanIn(dir: string): string | undefined {
    try {
        const name = fs.readdirSync(dir)
            .filter(n => n.toLowerCase().endsWith('.alan'))
            .sort()[0];
        return name ? path.join(dir, name) : undefined;
    } catch {
        return undefined;
    }
}

function resolveInWorkspace(rel: string): Uri | undefined {
    const folders = workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return undefined;
    }
    return Uri.file(path.join(folders[0].uri.fsPath, rel));
}
