import { Range, TextEditor, window, workspace } from 'vscode';
import { columnOf, rewrap, spanAt, stringSpans } from './strings';

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
            const column = columnOf(text, span.start, tabSize);
            const indent = lineIndent(text, span.start) + unit;
            const wrapped = rewrap(text.slice(span.start, span.end), column, indent, width, tabSize);
            if (wrapped !== text.slice(span.start, span.end)) {
                builder.replace(
                    new Range(document.positionAt(span.start), document.positionAt(span.end)),
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

/** The whitespace the string's own line begins with, tabs and spaces as written. */
function lineIndent(text: string, offset: number): string {
    const start = text.lastIndexOf('\n', offset - 1) + 1;
    const match = /^[ \t]*/.exec(text.slice(start, offset));
    return match ? match[0] : '';
}
