import {
    CodeAction, CodeActionKind, CodeActionProvider, ExtensionContext, Range, TextDocument,
    TextEditor, commands, env, languages, window, workspace
} from 'vscode';
import { rewrapPlan, spanAt, stringSpans } from './strings';
import { rewrapKeyContested, suppressRewrapKeyNotice } from './notices';
import { REWRAP_BINDING, hasRewrapBinding, withRewrapBinding } from './keybindings';
import { clearRewrapKeyStatusItem } from './status';

/**
 * Re-flow the string the cursor is in, or every string the selection touches.
 *
 * <p>An explicit command rather than part of Format Document, because the formatter's
 * contract is that it never reflows a string -- it moves multi-line ones as rigid
 * blocks. That contract is worth keeping: an author who runs a formatter is not asking
 * to have their prose re-laid out. This is where they ask.
 *
 * <p>Requested by an author who came from an editor that wrapped long strings for him
 * and found ours hard to work in. Word wrap now handles the reading; this handles the
 * source.
 */
export async function rewrapStringCommand(): Promise<void> {
    const editor = window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'alanif') {
        window.showInformationMessage('Alan IF: Re-wrap String works in an Alan source file.');
        return;
    }

    const document = editor.document;
    const text = document.getText();
    const spans = stringSpans(text);
    const targets = selected(editor, text, spans);

    if (targets.length === 0) {
        window.showInformationMessage(
            'Alan IF: put the cursor inside a string, or select some, to re-wrap.');
        return;
    }

    const { width, tabSize, unit } = layoutFor(document);

    // Applied back to front so that an earlier edit cannot move a later span.
    await editor.edit(builder => {
        for (const span of [...targets].reverse()) {
            const plan = rewrapPlan(text, spans, span, width, tabSize, unit);
            if (plan) {
                builder.replace(
                    new Range(document.positionAt(plan.from), document.positionAt(span.end)),
                    plan.text);
            }
        }
    });

    offerRewrapKeybinding();
}

let askedThisWindow = false;

/**
 * Offer to settle the key, at the moment the author would most like it settled.
 *
 * <p>Asked after a re-wrap rather than at startup: they are looking at the editor,
 * they have just used the very command this is about, and the message can be short
 * because the context is in front of them. A message hides itself after a moment, so
 * this is deliberately only half the answer -- the language status item carries the
 * same offer permanently, for anyone who missed this or came looking later.
 *
 * <p>It says "elsewhere" rather than naming Rewrap, for two reasons an author would
 * hit before we would: the key may be held by something else entirely on their
 * machine, and the two names collide -- "bound to Rewrap" beside "bind it to Re-wrap
 * String" reads as though the key were already bound to the thing being offered. The
 * name is worth having exactly once, on the status item's detail line, which is the
 * field whose job is the specific fact and the only place they can learn what has it.
 *
 * <p>Once per window at most, and never again once it has been settled either way.
 */
export function offerRewrapKeybinding(): void {
    if (askedThisWindow || !rewrapKeyContested()) {
        return;
    }
    askedThisWindow = true;
    window.showInformationMessage(
        'Alan IF IDE: Alt+Q is currently bound elsewhere, for all files. Do you want to '
        + 'bind it to Re-wrap String in Alan files instead?',
        'Yes, please', "No, don't ask again"
    ).then(async choice => {
        if (choice === 'Yes, please') {
            await bindRewrapKeyCommand();
        } else if (choice === "No, don't ask again") {
            settle();
        }
    });
}

/** Answered, however it was answered: stop offering, on both surfaces. */
function settle(): void {
    suppressRewrapKeyNotice();
    clearRewrapKeyStatusItem();
}

/**
 * Write the binding into the user's keybindings.json.
 *
 * <p>The file has to be OPENED to be edited -- there is no API for a keybinding, and
 * no way to name that file except by asking VS Code to open it -- but it does not have
 * to be left open. An author who answered a one-line question about a keyboard
 * shortcut did not ask to read JSON, and being dropped into a settings file is its own
 * small failure: it looks like there is something left for them to do.
 *
 * <p>So a file we opened is closed again, and the confirmation carries a button for
 * anyone who does want to see what was written. A file that was already open is left
 * exactly as it was found, because that one is theirs.
 */
export async function bindRewrapKeyCommand(): Promise<void> {
    const wasAlreadyOpen = workspace.textDocuments.some(isKeybindings);
    await commands.executeCommand('workbench.action.openGlobalKeybindingsFile');
    const editor = window.activeTextEditor;
    if (!editor || !isKeybindings(editor.document)) {
        return handItOver('Alan IF IDE: I could not open your keybindings file.');
    }

    const text = editor.document.getText();
    if (hasRewrapBinding(text)) {
        settle();
        await tidyAway(wasAlreadyOpen);
        showDone('Alan IF IDE: Alt+Q is already bound to Re-wrap String.');
        return;
    }

    const updated = withRewrapBinding(text);
    if (updated === undefined) {
        return handItOver('Alan IF IDE: your keybindings file is not laid out in a way '
            + 'I can add to safely, so I have left it exactly as it was.');
    }

    const whole = new Range(editor.document.positionAt(0), editor.document.positionAt(text.length));
    await editor.edit(builder => builder.replace(whole, updated));
    await editor.document.save();
    settle();
    await tidyAway(wasAlreadyOpen);
    showDone('Alan IF IDE: done — Alt+Q is now bound to Re-wrap String in Alan files, '
        + 'and keeps its old binding everywhere else.');
}

function isKeybindings(document: TextDocument): boolean {
    return document.fileName.endsWith('keybindings.json');
}

/** Close the file again, unless it was the author's own window before we arrived. */
async function tidyAway(wasAlreadyOpen: boolean): Promise<void> {
    if (!wasAlreadyOpen && window.activeTextEditor
        && isKeybindings(window.activeTextEditor.document)) {
        await commands.executeCommand('workbench.action.closeActiveEditor');
    }
}

/**
 * Said and done -- with the file one click away for anyone who wants to look.
 *
 * <p>"The keybindings", not "the file" and not "the settings": the file it opens is
 * keybindings.json, so that is the word an author will see when they get there.
 * Settings is a different file entirely, and would send them looking in the wrong one.
 */
const SHOW_ME = 'Show me the keybindings';

function showDone(message: string): void {
    window.showInformationMessage(message, SHOW_ME).then(choice => {
        if (choice === SHOW_ME) {
            commands.executeCommand('workbench.action.openGlobalKeybindingsFile');
        }
    });
}

/**
 * When we will not edit the file: give them the entry rather than instructions.
 *
 * <p>Modal for the same reason the question was: this one asks them to do something,
 * and a message that hides itself would leave an author holding a clipboard full of
 * JSON with no idea what it was for.
 */
async function handItOver(why: string): Promise<void> {
    await env.clipboard.writeText(REWRAP_BINDING);
    await window.showWarningMessage(why, {
        modal: true,
        detail: 'The binding is on your clipboard instead. Open Keyboard Shortcuts '
            + '(JSON) from the Command Palette and paste it between the [ ] brackets.',
    });
}

/**
 * The lightbulb: offer to re-wrap the string the cursor is in.
 *
 * <p>The one surface that comes to the author instead of waiting to be found. It is
 * offered only when re-wrapping would actually change something, which is not a
 * heuristic about length but the command's own answer -- rewrapPlan decides for both,
 * so the bulb cannot appear over a string that is already laid out, and cannot fail to
 * appear over one that is not.
 *
 * <p>A Refactor rather than a QuickFix: nothing here is wrong. A string laid out any
 * way at all prints identically, so this is a rewrite the author may want, never a
 * problem they should fix.
 */
class RewrapAction implements CodeActionProvider {
    provideCodeActions(document: TextDocument, range: Range): CodeAction[] {
        const text = document.getText();
        const spans = stringSpans(text);
        const span = spanAt(spans, document.offsetAt(range.start));
        if (!span) {
            return [];
        }

        const { width, tabSize, unit } = layoutFor(document);
        if (!rewrapPlan(text, spans, span, width, tabSize, unit)) {
            return [];
        }

        const action = new CodeAction('Re-wrap this string', CodeActionKind.RefactorRewrite);
        // Delegates to the command rather than carrying its own edit, so a string
        // re-wrapped from the bulb is re-wrapped by exactly the same code as one
        // re-wrapped from the menu, the palette or the key.
        action.command = { command: 'alanif.rewrapString', title: 'Re-wrap this string' };
        return [action];
    }
}

export function registerRewrapAction(context: ExtensionContext): void {
    context.subscriptions.push(languages.registerCodeActionsProvider(
        { language: 'alanif' }, new RewrapAction(),
        { providedCodeActionKinds: [CodeActionKind.RefactorRewrite] }));
}

/**
 * The width to wrap to, and how this editor writes one level of indent.
 *
 * <p>Taken from the open editor when there is one, because tab size and spaces-vs-tabs
 * are the EDITOR's answer and not the file's; the defaults are what VS Code itself
 * starts from, for the code-action path where no editor is in hand.
 */
function layoutFor(document: TextDocument): { width: number; tabSize: number; unit: string } {
    const width = workspace.getConfiguration('alanif', document.uri)
        .get<number>('format.stringWidth') ?? 80;
    const editor = window.activeTextEditor?.document === document
        ? window.activeTextEditor : undefined;
    const tabSize = Number(editor?.options.tabSize) || 4;
    const unit = editor?.options.insertSpaces === false ? '\t' : ' '.repeat(tabSize);
    return { width, tabSize, unit };
}

/** The strings the cursor is in, or all those a non-empty selection touches. */
function selected(editor: TextEditor, text: string, spans: { start: number; end: number }[]) {
    const document = editor.document;
    const chosen: { start: number; end: number }[] = [];
    for (const selection of editor.selections) {
        const from = document.offsetAt(selection.start);
        const to = document.offsetAt(selection.end);
        if (from === to) {
            const here = spanAt(spans, from);
            if (here && !chosen.includes(here)) {
                chosen.push(here);
            }
            continue;
        }
        for (const span of spans) {
            if (span.start < to && span.end > from && !chosen.includes(span)) {
                chosen.push(span);
            }
        }
    }
    return chosen.sort((a, b) => a.start - b.start);
}

