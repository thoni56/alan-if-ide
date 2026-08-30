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

/**
 * Whether the line containing `offset` begins inside some OTHER string.
 *
 * <p>Alan prose is routinely interrupted and resumed -- {@code ... about the "Style
 * alert. "Grotto" Style normal. "before you go...} -- so one physical line can be the
 * interior of one literal and the opening of the next. Moving the second onto a line
 * of its own would insert a break into the middle of the first, which is not ours to
 * do. Such a string is re-flowed where it stands.
 */
export function lineOpensInsideAnotherString(text: string, spans: StringSpan[],
    offset: number): boolean {
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    return spans.some(s => s.start < lineStart && s.end > lineStart);
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
 * A run of text to be filled, and how it is separated from the run before it.
 *
 * <p>`$p` and `$n` are what actually carry structure in Alan prose -- a paragraph and
 * a line break in the GAME's output -- while the source's own line breaks carry none.
 * Honouring them when re-flowing makes the source look like what the player will read,
 * which is the whole reason an author re-reads their own prose. It is free: a blank
 * line inside an Alan string is as invisible to the game as a single one (measured,
 * both ways, against a real transcript).
 */
interface Paragraph {
    /** Text of the run, markers included -- `$p` stays glued to the word it precedes. */
    text: string;
    /** What comes before it: nothing, a line break, or a blank line. */
    gap: '' | 'n' | 'p';
}

/** Split content at `$p` / `$n`, keeping each marker with the run it introduces. */
function paragraphs(content: string): Paragraph[] {
    const parts: Paragraph[] = [];
    const marker = /\$[pn]/gi;
    let at = 0;
    let gap: '' | 'n' | 'p' = '';
    let m: RegExpExecArray | null;
    while ((m = marker.exec(content)) !== null) {
        parts.push({ text: content.slice(at, m.index), gap });
        gap = m[0][1].toLowerCase() === 'p' ? 'p' : 'n';
        at = m.index;
        marker.lastIndex = m.index + m[0].length;
    }
    parts.push({ text: content.slice(at), gap });
    return parts.filter((part, i) => i === 0 || part.text.trim().length > 0);
}

/**
 * Where the continuation lines of a re-wrapped string begin.
 *
 * <p>THE QUOTE HANGS INTO THE MARGIN, so that the PROSE is what lines up: a
 * continuation line starts one column right of the opening quote, which is exactly
 * where the first line's text starts. The block then reads as the paragraph it prints
 * as, with the quote marking its edge instead of stepping on its first line.
 *
 * <p>The indent unit is the fallback for the one case that cannot hang: a string that
 * opens partway along a line it does not own -- Alan prose is routinely interrupted
 * and resumed -- where the quote may sit at column 60 and aligning under it would
 * leave no room to write in. Such a string is re-flowed where it stands, under a plain
 * indent from its line.
 *
 * @param lineIndent  the whitespace the string's line begins with, as written
 * @param quoteColumn the visual column of the opening quote
 */
export function continuationIndent(lineIndent: string, quoteColumn: number, unit: string,
    tabSize: number): string {
    const ownsItsLine = quoteColumn === visualWidth(lineIndent, tabSize);
    return ownsItsLine ? lineIndent + ' ' : lineIndent + unit;
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
    if (content.trim().length === 0) {
        return literal;   // nothing but whitespace: not ours to reorganise
    }

    // A SPACE AT EITHER END OF A LITERAL IS CONTENT, not layout. Adjacent strings and
    // statements print one after another with nothing between them, so authors put a
    // space inside the quotes to separate them -- `"...you say to yourself. "` before
    // the next literal. Whitespace BETWEEN words is collapsed by the interpreter and
    // so is ours to re-flow; whitespace at the edges is the author's and survives.
    // Found by re-wrapping all 5261 strings of a real game and diffing its transcript:
    // two lines came back changed, and both were an edge space.
    const opening = /^\s/.test(content) ? ' ' : '';
    const closing = /\s$/.test(content) ? ' ' : '';

    const indentWidth = visualWidth(indent, tabSize);
    const out: string[] = [];
    let first = true;

    for (const part of paragraphs(content)) {
        const words = part.text.split(/\s+/).filter(w => w.length > 0);
        if (words.length === 0) {
            continue;
        }
        const lines: string[] = [];
        let line = '';
        // The very first line starts after the opening quote; every other line, and
        // every paragraph after the first, starts after the indent.
        let room = first ? width - column - 1 : width - indentWidth;
        for (const word of words) {
            if (line === '') {
                line = word;                   // always at least one word, even if it overflows
            } else if (line.length + 1 + word.length <= room) {
                line += ' ' + word;
            } else {
                lines.push(line);
                line = word;
                room = width - indentWidth;
            }
        }
        lines.push(line);

        const block = lines.join('\n' + indent);
        if (first) {
            out.push(block);
        } else {
            // The separating line is left EMPTY rather than indented to match. It reads
            // the same, git does not flag it, and an editor that strips trailing space
            // on save cannot silently undo the layout this command just produced.
            out.push((part.gap === 'p' ? '\n\n' : '\n') + indent + block);
        }
        first = false;
    }

    return '"' + opening + out.join('') + closing + '"';
}

/** Visual width of a whitespace run, tabs advancing to the next tab stop. */
export function visualWidth(text: string, tabSize: number): number {
    let column = 0;
    for (const c of text) {
        column = c === '\t' ? (Math.floor(column / tabSize) + 1) * tabSize : column + 1;
    }
    return column;
}
