import { EndOfLine, Range, TextEditor, commands, window } from 'vscode';
import { toggleBlockComment } from './comments';

/**
 * Toggle Block Comment, ours rather than VS Code's.
 *
 * <p>The built-in reads `comments.blockComment` out of a language configuration and
 * inserts the two delimiters at the ends of the selection, inline. Alan's delimiters
 * are LINES -- see comments.ts for the rule and where it comes from -- so the built-in
 * could not produce a comment the compiler accepts in any case at all, and the
 * declaration that fed it has been withdrawn. Shift+Alt+A now arrives here, and so
 * does the Edit menu -- see takeOverBuiltInBlockComment.
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

/** VS Code's own Toggle Block Comment: the Edit menu, the palette, the default key. */
const BUILT_IN = 'editor.action.blockComment';

/**
 * Run ours wherever an author reaches for VS Code's own Toggle Block Comment.
 *
 * <p>Withdrawing the declaration left the built-in with nothing to read, so in an Alan
 * file the Edit menu entry did nothing at all. VS Code has no hook for a language to
 * supply its own, and an extension cannot add to the Edit menu. It can register the
 * built-in's id, though, and the newest registration wins. So the id is ours while an
 * Alan file is the active editor, and given back the moment it is not.
 */
export function takeOverBuiltInBlockComment(): { dispose(): void } {
    let taken: { dispose(): void } | undefined;
    const follow = (editor: TextEditor | undefined) => {
        const alan = editor?.document.languageId === 'alanif';
        if (alan && !taken) {
            taken = commands.registerCommand(BUILT_IN, () => toggleBlockCommentCommand());
        } else if (!alan && taken) {
            taken.dispose();
            taken = undefined;
        }
    };

    follow(window.activeTextEditor);
    const following = window.onDidChangeActiveTextEditor(follow);
    return {
        dispose() {
            following.dispose();
            follow(undefined);
        },
    };
}
