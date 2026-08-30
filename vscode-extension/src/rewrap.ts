import { Range, TextEditor, commands, env, extensions, window, workspace } from 'vscode';
import {
    columnOf, continuationIndent, lineOpensInsideAnotherString, rewrap, spanAt, stringSpans,
    visualWidth
} from './strings';
import { rewrapKeyNoticeSuppressed, suppressRewrapKeyNotice } from './notices';
import { REWRAP_BINDING, hasRewrapBinding, withRewrapBinding } from './keybindings';

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

    const config = workspace.getConfiguration('alanif', document.uri);
    const width = config.get<number>('format.stringWidth') ?? 80;
    const tabSize = Number(editor.options.tabSize) || 4;
    const unit = editor.options.insertSpaces ? ' '.repeat(tabSize) : '\t';

    // Applied back to front so that an earlier edit cannot move a later span.
    await editor.edit(builder => {
        for (const span of [...targets].reverse()) {
            const literal = text.slice(span.start, span.end);
            const own = lineIndent(text, span.start);
            const inlineColumn = columnOf(text, span.start, tabSize);
            let wrapped = rewrap(literal, inlineColumn,
                continuationIndent(own, inlineColumn, unit, tabSize), width, tabSize);
            let from = span.start;

            // A STRING THAT ENDS UP SPANNING LINES IS A BLOCK, so give it one. Decided
            // from the RESULT rather than the input: what matters is whether the author
            // is about to have prose hanging off the end of a keyword. Format Document
            // will not do this -- moving text between lines is outside its contract --
            // which is exactly why it belongs to the command you had to ask for.
            const shouldMove = wrapped.includes('\n')
                && inlineColumn > visualWidth(own, tabSize)
                && !lineOpensInsideAnotherString(text, spans, span.start);
            if (shouldMove) {
                // One level in from the line it is leaving, and then wrapped as a string
                // that owns its line -- which it now does.
                const moved = own + unit;
                const movedColumn = visualWidth(moved, tabSize);
                wrapped = '\n' + moved + rewrap(literal, movedColumn,
                    continuationIndent(moved, movedColumn, unit, tabSize), width, tabSize);
                from = startOfRun(text, span.start);
            }

            if (wrapped !== literal) {
                builder.replace(
                    new Range(document.positionAt(from), document.positionAt(span.end)),
                    wrapped);
            }
        }
    });

    await offerRewrapKeybinding();
}

/**
 * The Rewrap extension, which binds Alt+Q for every language there is.
 *
 * <p>Ours may simply lose: VS Code settles a contested chord by taking the LAST rule
 * registered, which is extension load order, and a more specific `when` clause buys
 * no precedence. Rewrap then runs, looks for a wrapping parser for `alanif`, has none
 * -- it is not in its language table, and not plaintext either, so it does not get the
 * plain-text fallback -- and returns having done nothing.
 *
 * <p>Which is the worst shape a missing feature can take. Nothing errors, nothing is
 * logged, the Keyboard Shortcuts list shows our binding present and correct, and the
 * key does nothing: it looks like OUR command is broken.
 */
const REWRAP_EXTENSION = 'stkb.rewrap';

let askedThisWindow = false;

/**
 * Offer to settle the key -- ASKED WHEN THEY HAVE JUST RE-WRAPPED SOMETHING, not at
 * startup.
 *
 * <p>ASKED AS A MODAL, which is not a decision taken lightly. An information toast
 * hides itself after a moment, so every earlier placement of this question was one
 * the author might never read -- and the cost of missing it is a key that stays dead
 * for good, looking like our bug. This file's own neighbours exist because a
 * notification that leaves no trace is no way to report anything that matters; one
 * that dismisses itself leaves none either.
 *
 * <p>What makes the modal proportionate is WHEN it is asked. It follows a deliberate
 * action -- they just ran Re-wrap String -- so it is a reply rather than an
 * interruption, it is one question with one click either way, and it is asked at most
 * once in the life of the installation. Escape answers "later"; either button answers
 * for good.
 */
export function offerRewrapKeybinding(): Promise<void> {
    if (askedThisWindow || rewrapKeyNoticeSuppressed()
        || !extensions.getExtension(REWRAP_EXTENSION)) {
        return Promise.resolve();
    }
    askedThisWindow = true;
    return Promise.resolve(window.showInformationMessage(
        'Give Alt+Q to Re-wrap String in Alan files?',
        {
            modal: true,
            detail: 'The Rewrap extension also uses Alt+Q, and in an Alan file it does '
                + 'nothing at all — which is why that key can seem dead here. Alan IF '
                + 'IDE can take Alt+Q for Alan files and leave every other language to '
                + 'Rewrap.',
        },
        'Yes, please', "No, don't ask again"
    )).then(async choice => {
        if (choice === undefined) {
            return;                              // Escape: ask again another day
        }
        suppressRewrapKeyNotice();
        if (choice === 'Yes, please') {
            await addRewrapKeybinding();
        }
    });
}

/**
 * Write the binding into the user's keybindings.json, and show them what happened.
 *
 * <p>The file is opened rather than written behind their back -- it is theirs, it is
 * the one place their own choices live, and an edit they cannot see is not one they
 * can undo. Saving it is still ours to do: an unsaved change means Alt+Q keeps doing
 * nothing, which is the confusion we are here to end.
 */
async function addRewrapKeybinding(): Promise<void> {
    await commands.executeCommand('workbench.action.openGlobalKeybindingsFile');
    const editor = window.activeTextEditor;
    if (!editor || !editor.document.fileName.endsWith('keybindings.json')) {
        return handItOver('Alan IF IDE: I could not open your keybindings file.');
    }

    const text = editor.document.getText();
    if (hasRewrapBinding(text)) {
        window.showInformationMessage(
            'Alan IF IDE: Alt+Q is already bound to Re-wrap String — your keybindings '
            + 'file is open if you want to check it.');
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
    window.showInformationMessage(
        'Alan IF IDE: done — Alt+Q now runs Re-wrap String in Alan files, and Rewrap '
        + 'keeps every other language. The line I added is in the file now open.');
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

/** Back up over the spaces and tabs before `offset`, so moving leaves no trailing run. */
function startOfRun(text: string, offset: number): number {
    let at = offset;
    while (at > 0 && (text[at - 1] === ' ' || text[at - 1] === '\t')) {
        at--;
    }
    return at;
}

/** The whitespace the string's own line begins with, tabs and spaces as written. */
function lineIndent(text: string, offset: number): string {
    const start = text.lastIndexOf('\n', offset - 1) + 1;
    const match = /^[ \t]*/.exec(text.slice(start, offset));
    return match ? match[0] : '';
}
