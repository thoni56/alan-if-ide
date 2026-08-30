import { Range, TextEditor, window, workspace } from 'vscode';
import {
    columnOf, continuationIndent, lineOpensInsideAnotherString, rewrap, spanAt, stringSpans,
    visualWidth
} from './strings';

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
