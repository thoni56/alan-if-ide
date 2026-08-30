import { ExtensionContext, Memento, extensions } from 'vscode';
import { REWRAP_EXTENSION_ID } from './keybindings';

/**
 * The one piece of setup state that is a user PREFERENCE rather than a fact about
 * the machine: whether the startup notice about a missing compiler has been turned
 * off. It lives apart from environment.ts for exactly that reason -- nothing here
 * is discovered, so nothing here can be re-resolved.
 *
 * "Don't show again" is otherwise a one-way door: there is no settings entry for it
 * and no command to undo it. Running Check Setup counts as saying you do want to
 * hear about setup, so it opens the door again.
 */
const SUPPRESS_COMPILER_NOTICE = 'alanif.suppressMissingCompilerNotice';

let store: Memento | undefined;

export function initNotices(context: ExtensionContext): void {
    store = context.globalState;
}

export function compilerNoticeSuppressed(): boolean {
    return store?.get<boolean>(SUPPRESS_COMPILER_NOTICE) === true;
}

export function suppressCompilerNotice(): void {
    store?.update(SUPPRESS_COMPILER_NOTICE, true);
}

/**
 * And whether the author has been told that Alt+Q may not reach Re-wrap String.
 *
 * <p>Kept separate from the compiler notice, because they are different promises:
 * that one says a tool is missing and can be found again, this one says a key is
 * taken and stays taken. Check Setup reopens the first; nothing reopens this, since
 * an author who has chosen their own binding does not want asking twice.
 */
const SUPPRESS_REWRAP_KEY_NOTICE = 'alanif.suppressRewrapKeybindingNotice';

export function rewrapKeyNoticeSuppressed(): boolean {
    return store?.get<boolean>(SUPPRESS_REWRAP_KEY_NOTICE) === true;
}

export function suppressRewrapKeyNotice(): void {
    store?.update(SUPPRESS_REWRAP_KEY_NOTICE, true);
}

/** Undo the suppression. Returns true only if it was actually in effect. */
export function restoreCompilerNotice(): boolean {
    if (!compilerNoticeSuppressed()) {
        return false;
    }
    store?.update(SUPPRESS_COMPILER_NOTICE, false);
    return true;
}

/**
 * Whether Alt+Q is contested and the author has not yet settled it.
 *
 * <p>Both halves matter: without Rewrap installed the key is ours already, and once
 * they have answered -- either way -- there is nothing left to report. It cannot tell
 * that someone bound the key by hand; pressing the offer finds that out and settles
 * it, which is the cheapest place for that check to live.
 */
export function rewrapKeyContested(): boolean {
    return !rewrapKeyNoticeSuppressed() && extensions.getExtension(REWRAP_EXTENSION_ID) !== undefined;
}
