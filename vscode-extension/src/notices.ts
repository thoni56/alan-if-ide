import { ExtensionContext, Memento } from 'vscode';

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

/** Undo the suppression. Returns true only if it was actually in effect. */
export function restoreCompilerNotice(): boolean {
    if (!compilerNoticeSuppressed()) {
        return false;
    }
    store?.update(SUPPRESS_COMPILER_NOTICE, false);
    return true;
}
