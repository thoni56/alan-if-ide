import { EndOfLine, Range, window } from 'vscode';
import { toggleBlockComment } from './comments';

/**
 * Toggle Block Comment, ours rather than VS Code's.
 *
 * <p>The built-in reads `comments.blockComment` out of a language configuration and
 * inserts the two delimiters at the ends of the selection, inline. Alan's delimiters
 * are LINES -- see comments.ts for the rule and where it comes from -- so the built-in
 * could not produce a comment the compiler accepts in any case at all, and the
 * declaration that fed it has been withdrawn. Shift+Alt+A now arrives here.
 *
 * <p>The command carries no rule of its own: it turns selections into line numbers,
 * asks comments.ts what the text should become, and writes one edit per selection.
 */
export async function toggleBlockCommentCommand(): Promise<void> {
    const editor = window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'alanif') {
        window.showInformationMessage(
            'Alan IF: Toggle Block Comment works in an Alan source file.');
        return;
    }

    const document = editor.document;
    const eol = document.eol === EndOfLine.CRLF ? '\r\n' : '\n';
    const lines = document.getText().split(/\r?\n/);

    const edits = editor.selections
        .map(selection => toggleBlockComment(lines, {
            startLine: selection.start.line, startCharacter: selection.start.character,
            endLine: selection.end.line, endCharacter: selection.end.character,
        }))
        // Back to front, so that an earlier edit cannot move a later one.
        .sort((a, b) => b.firstLine - a.firstLine);

    await editor.edit(builder => {
        // Uncommenting reaches out to delimiters the selection cannot see, so two
        // cursors in one comment produce the same edit twice. VS Code rejects a set
        // of edits that overlap -- ALL of them, not the surplus one -- so the
        // duplicate is dropped here rather than discovered there.
        let written = lines.length;
        for (const edit of edits) {
            if (edit.lastLine >= written) {
                continue;
            }
            written = edit.firstLine;
            builder.replace(
                new Range(edit.firstLine, 0, edit.lastLine, lines[edit.lastLine].length),
                edit.lines.join(eol));
        }
    });
}
