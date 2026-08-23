import * as path from 'path';
import { EventEmitter, Event, commands, window, workspace, Uri } from 'vscode';
import { Legacy, findLegacy, convertToUtf8 } from './encoding';

/**
 * What the last scan found, so the language status bubble can keep offering the fix
 * long after the notification has gone. A toast lasts about fifteen seconds, which is
 * not long enough to read an explanation, decide, and act.
 */
let legacy: Legacy[] = [];
const changed = new EventEmitter<Legacy[]>();
export const onEncodingChanged: Event<Legacy[]> = changed.event;

export function legacyFiles(): Legacy[] {
    return legacy;
}

async function rescan(): Promise<Legacy[]> {
    const sources = await workspace.findFiles('**/*.{alan,i}', '**/node_modules/**');
    legacy = findLegacy(sources.map(u => u.fsPath));
    changed.fire(legacy);
    return legacy;
}

/**
 * Get the project's sources onto one encoding, and say what that means.
 *
 * The IDE takes a position rather than accommodating both encodings, because
 * accommodating them cannot fix what the author SEES: a Latin-1 file opened as UTF-8
 * shows replacement characters whatever flag we pass the compiler, and an edit
 * followed by a save writes those placeholders over the original bytes for good.
 *
 * So this insists -- there is no "never ask again". It does not act silently, though:
 * rewriting someone's manuscript without saying so would be a worse trade than the
 * one it is trying to prevent.
 */
export async function ensureUtf8Sources(): Promise<void> {
    const legacy = await rescan();
    if (legacy.length === 0) {
        return;
    }
    const total = (await workspace.findFiles('**/*.{alan,i}', '**/node_modules/**')).length;

    // A file being rewritten underneath an unsaved buffer would be undone by the next
    // save, and the buffer holds the mis-decoded text -- exactly what we are removing.
    const dirty = workspace.textDocuments.filter(
        d => d.isDirty && legacy.some(l => l.path === d.uri.fsPath));
    if (dirty.length > 0) {
        const save = await window.showWarningMessage(
            `Alan IF: ${names(dirty.map(d => d.uri.fsPath))} must be saved before the `
            + 'encoding can be repaired.', 'Save and Continue');
        if (save !== 'Save and Continue') {
            return;
        }
        await Promise.all(dirty.map(d => d.save()));
    }

    // Modal on purpose. This is a one-time decision about the author's own files, and
    // a notification that fades in fifteen seconds is not where it belongs -- a
    // beginner cannot read it, weigh it and act in that time, and the way back is a
    // bell icon they have never noticed.
    const choice = await window.showWarningMessage(
        `${legacy.length} of ${total} Alan source files are not UTF-8`,
        { modal: true, detail: detail(legacy) },
        'Convert to UTF-8', 'Show Files');

    if (choice === 'Show Files') {
        for (const l of legacy.slice(0, 5)) {
            await window.showTextDocument(Uri.file(l.path), { preview: false });
        }
        return;   // the offer returns next time; this is a look, not a decision
    }
    if (choice !== 'Convert to UTF-8') {
        return;
    }

    const failed: string[] = [];
    for (const l of legacy) {
        try {
            convertToUtf8(l.path);
        } catch {
            failed.push(l.path);
        }
    }

    if (failed.length > 0) {
        window.showErrorMessage(
            `Alan IF: could not rewrite ${names(failed)}. Check the file permissions.`);
    }
    const done = legacy.length - failed.length;
    await rescan();
    if (done === 0) {
        return;
    }

    // The one consequence the author cannot discover for themselves: their sources are
    // now UTF-8, and a build outside this editor still defaults to ISO-8859-1, which
    // succeeds and quietly produces mangled text. Say it once, plainly.
    const reload = await window.showInformationMessage(
        `Alan IF: converted ${done} file${done === 1 ? '' : 's'} to UTF-8. `
        + 'Builds run outside this editor now need "-encoding utf8", or they will '
        + 'succeed and produce mangled text. If you really need to reverse this, it is '
        + 'done with iconv, a separate command-line program: '
        + 'iconv -f UTF-8 -t ISO-8859-1',
        'Reload Window');
    if (reload === 'Reload Window') {
        commands.executeCommand('workbench.action.reloadWindow');
    }
}

function detail(legacy: Legacy[]): string {
    const chars = legacy.reduce((n, l) => n + l.highBytes, 0);
    return `${names(legacy.map(l => l.path))} contain ${chars} character`
        + `${chars === 1 ? '' : 's'} written in an older encoding. Their text is shown `
        + 'wrongly in the editor, and the Alan compiler cannot read them at all, so no '
        + 'errors can be reported for this project until it is fixed.\n\n'
        + 'Converting to UTF-8 is lossless: the game it builds is identical. Builds run '
        + 'outside this editor will then need "-encoding utf8".\n\n'
        // Conditional on purpose. Stated flatly, "you can undo this" reads as an equal
        // second option and invites converting back and forth; "if you really need to"
        // says which way we expect this to go without forbidding the other. And iconv
        // is named as a program, not a spell: an author who has never used a terminal
        // should be able to tell it is somewhere else, not a menu they missed.
        + 'If you really need to reverse the conversion later, that is done with iconv, '
        + 'a separate command-line program rather than anything in VS Code: '
        + 'iconv -f UTF-8 -t ISO-8859-1';
}

/** "a.i", "a.i and b.i", "a.i and 4 others" -- a notification is prose, not a list. */
function names(paths: string[]): string {
    const base = paths.map(p => path.basename(p));
    if (base.length === 1) { return base[0]; }
    if (base.length === 2) { return `${base[0]} and ${base[1]}`; }
    return `${base[0]} and ${base.length - 1} others`;
}
