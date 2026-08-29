/**
 * Re-flowing the text inside an Alan string.
 *
 * <p>SAFE BY CONSTRUCTION, and measured rather than assumed: a string broken across
 * source lines prints as one flowed paragraph. The newline and the leading indentation
 * of a continuation line collapse to a single space, and the interpreter wraps to the
 * terminal it is running in. Structure comes from markers in the text -- `$p` for a
 * paragraph, `$n` for a line break -- never from where the author happened to press
 * Return. So re-wrapping cannot change a single byte of what the game prints, whatever
 * width is chosen.
 *
 * <p>That is a stronger guarantee than the formatter has anywhere else, which is why
 * Format Document deliberately moves multi-line strings as rigid blocks and never
 * reflows them: without the guarantee, silently re-laying out someone's prose would be
 * unforgivable. With it, an explicit command is simply a convenience.
 *
 * <p>Kept free of the editor so it can be tested as text in, text out.
 */

/** A string literal in the source, as offsets that include both quotes. */
export interface StringSpan {
    start: number;
    end: number;
}

/**
 * Every string literal in `text`.
 *
 * <p>The grammar's terminals are the whole specification here, and each of the other
 * three can contain a quote that means nothing:
 * <pre>
 *   STRING:     '"' ( '""' | !('"') )* '"'      -- a doubled quote is a literal one
 *   QUOTED_ID:  "'" ( "''" | !("'") )* "'"      -- may contain "
 *   SL_COMMENT: '--' to end of line
 *   ML_COMMENT: '////' ... '////'
 * </pre>
 */
export function stringSpans(text: string): StringSpan[] {
    const spans: StringSpan[] = [];
    let i = 0;
    while (i < text.length) {
        const c = text[i];

        if (c === '/' && text.startsWith('////', i)) {
            const close = text.indexOf('////', i + 4);
            i = close === -1 ? text.length : close + 4;
            continue;
        }
        if (c === '-' && text.startsWith('--', i)) {
            const nl = text.indexOf('\n', i);
            i = nl === -1 ? text.length : nl + 1;
            continue;
        }
        if (c === "'") {
            i++;
            while (i < text.length) {
                if (text[i] === "'") {
                    if (text[i + 1] === "'") { i += 2; continue; }   // an escaped quote
                    i++;
                    break;
                }
                i++;
            }
            continue;
        }
        if (c === '"') {
            const start = i;
            i++;
            while (i < text.length) {
                if (text[i] === '"') {
                    if (text[i + 1] === '"') { i += 2; continue; }
                    i++;
                    break;
                }
                i++;
            }
            spans.push({ start, end: i });
            continue;
        }
        i++;
    }
    return spans;
}

/** The span containing `offset`, or the one the cursor is resting against. */
export function spanAt(spans: StringSpan[], offset: number): StringSpan | undefined {
    return spans.find(s => offset >= s.start && offset <= s.end);
}

/** The visual column of `offset`, counting a tab as advancing to the next tab stop. */
export function columnOf(text: string, offset: number, tabSize: number): number {
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    let column = 0;
    for (let i = lineStart; i < offset; i++) {
        column = text[i] === '\t' ? (Math.floor(column / tabSize) + 1) * tabSize : column + 1;
    }
    return column;
}

/**
 * Re-flow one string literal, quotes included, to `width` visual columns.
 *
 * @param literal   the literal as it stands, including both quotes
 * @param column    the visual column the opening quote sits at
 * @param indent    the literal indentation to give continuation lines
 * @param width     the column to wrap before
 */
export function rewrap(literal: string, column: number, indent: string, width: number,
    tabSize: number): string {
    const content = literal.slice(1, -1);
    const words = content.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) {
        return literal;   // nothing but whitespace: not ours to reorganise
    }

    const indentWidth = visualWidth(indent, tabSize);
    const lines: string[] = [];
    let line = '';
    // The first line starts after the opening quote; the rest start after the indent.
    let room = width - column - 1;

    for (const word of words) {
        if (line === '') {
            line = word;                       // always at least one word, even if it overflows
        } else if (line.length + 1 + word.length <= room) {
            line += ' ' + word;
        } else {
            lines.push(line);
            line = word;
            room = width - indentWidth;
        }
    }
    lines.push(line);

    return '"' + lines.join('\n' + indent) + '"';
}

function visualWidth(text: string, tabSize: number): number {
    let column = 0;
    for (const c of text) {
        column = c === '\t' ? (Math.floor(column / tabSize) + 1) * tabSize : column + 1;
    }
    return column;
}
