/**
 * Alan's block comments, and toggling one around a selection.
 *
 * <p>VS Code has a Toggle Block Comment of its own, and for eight releases we handed it
 * the delimiters and let it run. It inserts them INLINE -- at the two ends of the
 * selection, wherever those happen to fall -- and Alan's are LINE delimiters, so it
 * could not produce a valid comment in any case at all, not even a one-line one. The
 * author who reported it selected four lines of prose and got `on ////` on the last of
 * them, which does not close anything: the comment then ran to the end of the file and
 * swallowed his `Start at`.
 *
 * <p>THE RULE, from the compiler's own scanner (alan.smk, the block_comment scanner
 * action) and confirmed against the binary in comments.test.ts:
 * <ul>
 *   <li>the opening `////` must stand in the FIRST COLUMN -- an indented one is error
 *       156, "Block comment must start in first column";
 *   <li>the rest of the opening line is inside the comment;
 *   <li>the comment ends at the first line that is FOUR OR MORE SLASHES AND NOTHING
 *       ELSE -- not even a trailing space, since the scanner runs past the slashes and
 *       then demands the end of the line;
 *   <li>and if no such line arrives, it is error 155 at end of file.
 * </ul>
 *
 * <p>Nothing in a language-configuration.json can express that, which is why this is a
 * command of our own and the declaration that fed the built-in is gone.
 *
 * <p>Kept free of the editor so it can be tested as text in, text out.
 */

/** A block comment, as line numbers; `close` is missing when it runs to end of file. */
export interface BlockComment {
    open: number;
    close: number | undefined;
}

/** The lines an editor selection covers, in the editor's own coordinates. */
export interface Selection {
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
}

/** Replace lines `firstLine` to `lastLine` inclusive with `lines`. */
export interface BlockCommentEdit {
    firstLine: number;
    lastLine: number;
    lines: string[];
}

/** A delimiter, and the only form of one there is. */
export const DELIMITER = '////';

const OPENS = /^\/{4}/;
const CLOSES = /^\/{4,}\r?$/;

/**
 * Every block comment in `lines`, in the order they open.
 *
 * <p>A scan rather than a search, because what a delimiter is depends on what came
 * before it: an Alan string runs across lines, and a line of slashes inside one is the
 * author's prose. Four slashes anywhere but the first column are not a delimiter at all
 * -- the compiler rejects the opening one and does not accept the closing one -- so
 * `on ////` is text here, exactly as it is to the compiler.
 */
export function blockComments(lines: string[]): BlockComment[] {
    const comments: BlockComment[] = [];
    let open: number | undefined;
    let inString = false;
    let inQuotedId = false;

    for (let line = 0; line < lines.length; line++) {
        const text = lines[line];
        if (open !== undefined) {
            if (CLOSES.test(text)) {
                comments.push({ open, close: line });
                open = undefined;
            }
            continue;
        }
        if (!inString && !inQuotedId && OPENS.test(text)) {
            // The rest of this line is inside the comment, so there is nothing left
            // on it to scan -- and it cannot close the comment it just opened.
            open = line;
            continue;
        }

        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (inString || inQuotedId) {
                const quote = inString ? '"' : "'";
                if (c === quote) {
                    // A doubled quote is a literal one. A line ending stops that:
                    // two quotes with a newline between them are two delimiters.
                    if (text[i + 1] === quote) { i++; }
                    else { inString = inQuotedId = false; }
                }
                continue;
            }
            if (c === '"') { inString = true; continue; }
            if (c === "'") { inQuotedId = true; continue; }
            if (c === '-' && text[i + 1] === '-') { break; }
        }
    }

    if (open !== undefined) {
        comments.push({ open, close: undefined });
    }
    return comments;
}

/**
 * Comment the selected lines out, or -- if they are already commented -- take the
 * comment away.
 *
 * <p>WHOLE LINES, always, because the delimiters can only be whole lines. A selection
 * that stops at the start of a line does not take that line: dragging down the margin
 * ends one line further than the author meant, and every editor in the world treats
 * that the same way.
 *
 * <p>Uncommenting looks for the comment the selection is IN, not for delimiters inside
 * it. An author who puts the cursor in the middle of a comment and asks for it to go
 * means that comment, and its delimiters are somewhere they cannot see.
 */
export function toggleBlockComment(lines: string[], selection: Selection): BlockCommentEdit {
    const first = selection.startLine;
    const last = selection.endCharacter === 0 && selection.endLine > first
        ? selection.endLine - 1 : selection.endLine;

    const lastLine = lines.length - 1;
    const enclosing = blockComments(lines)
        .filter(c => c.open <= last && (c.close ?? lastLine) >= first);

    if (enclosing.length === 0) {
        return {
            firstLine: first, lastLine: last,
            lines: [DELIMITER, ...lines.slice(first, last + 1), DELIMITER],
        };
    }

    const from = Math.min(first, ...enclosing.map(c => c.open));
    const to = Math.max(last, ...enclosing.map(c => c.close ?? lastLine));
    const kept: string[] = [];
    for (let line = from; line <= to; line++) {
        if (enclosing.some(c => c.close === line)) {
            continue;
        }
        if (enclosing.some(c => c.open === line)) {
            const rest = uncommented(lines[line]);
            if (rest !== undefined) { kept.push(rest); }
            continue;
        }
        kept.push(lines[line]);
    }
    return { firstLine: from, lastLine: to, lines: kept };
}

/**
 * What an opening line leaves behind: nothing at all when it is only slashes, and
 * otherwise the text the author wrote after them.
 *
 * <p>One space goes with the delimiter, because `//// a note` is how anyone writes it
 * and the space is punctuation rather than something they typed to keep.
 */
function uncommented(line: string): string | undefined {
    if (CLOSES.test(line)) {
        return undefined;
    }
    const rest = line.slice(DELIMITER.length);
    return rest.startsWith(' ') ? rest.slice(1) : rest;
}
