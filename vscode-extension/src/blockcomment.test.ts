import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Module from 'node:module';

/**
 * The WIRING: selections in, one edit out.
 *
 * <p>What comments.ts cannot see -- that whole lines are replaced and not truncated,
 * that a CRLF file stays CRLF, and that two cursors in the same comment do not each
 * try to remove it. A stub of the handful of editor calls the command makes is enough
 * to drive it, the same technique status.test.ts uses.
 */

interface FakeRange { startLine: number; startCharacter: number; endLine: number; endCharacter: number; }

const vscode = {
    EndOfLine: { LF: 1, CRLF: 2 },
    Position: class { constructor(public line: number, public character: number) { } },
    Range: class {
        startLine: number; startCharacter: number; endLine: number; endCharacter: number;
        constructor(a: number, b: number, c: number, d: number) {
            this.startLine = a; this.startCharacter = b; this.endLine = c; this.endCharacter = d;
        }
    },
    window: {
        activeTextEditor: undefined as unknown,
        showInformationMessage(message: string) { said.push(message); },
    },
};

const said: string[] = [];

const load = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
(Module as unknown as { _load: unknown })._load = function (request: string, ...rest: unknown[]) {
    return request === 'vscode' ? vscode : (load as Function).apply(this, [request, ...rest]);
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { toggleBlockCommentCommand } = require('./blockcomment');

/** An editor over `text`, with the cursor or selection at each of `at`. */
function editorOn(text: string, at: FakeRange[], languageId = 'alanif') {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    const edits: { range: FakeRange; text: string }[] = [];
    const editor = {
        document: {
            languageId,
            eol: eol === '\r\n' ? vscode.EndOfLine.CRLF : vscode.EndOfLine.LF,
            lineCount: lines.length,
            getText: () => text,
            lineAt: (line: number) => ({ text: lines[line] }),
        },
        selections: at.map(r => ({
            start: { line: r.startLine, character: r.startCharacter },
            end: { line: r.endLine, character: r.endCharacter },
        })),
        edit(apply: (builder: { replace(range: FakeRange, text: string): void }) => void) {
            apply({ replace: (range, replacement) => edits.push({ range, text: replacement }) });
            return Promise.resolve(true);
        },
        /** The text the edits leave behind, applied as the editor applies them. */
        result(): string {
            let out = lines.slice();
            // Back to front, so an earlier edit cannot move a later one.
            for (const edit of [...edits].sort((a, b) => b.range.startLine - a.range.startLine)) {
                assert.equal(edit.range.startCharacter, 0, 'an edit starts at the left margin');
                assert.equal(edit.range.endCharacter, lines[edit.range.endLine].length,
                    'an edit runs to the end of its last line');
                out = [...out.slice(0, edit.range.startLine), ...edit.text.split(eol),
                       ...out.slice(edit.range.endLine + 1)];
            }
            return out.join(eol);
        },
        edited: edits,
    };
    vscode.window.activeTextEditor = editor;
    return editor;
}

test('whole lines are replaced, and the last of them is not truncated', async () => {
    const editor = editorOn('Some text on\na few lines\non\n',
        [{ startLine: 0, startCharacter: 0, endLine: 2, endCharacter: 2 }]);
    await toggleBlockCommentCommand();
    assert.equal(editor.result(), '////\nSome text on\na few lines\non\n////\n');
});

test('a CRLF file stays CRLF', async () => {
    // Joining with '\n' in a Windows file would leave lone newlines behind, and the
    // delimiter line would end up with a stray carriage return -- which closes nothing.
    const editor = editorOn('Some text\r\non\r\n',
        [{ startLine: 0, startCharacter: 0, endLine: 1, endCharacter: 2 }]);
    await toggleBlockCommentCommand();
    assert.equal(editor.result(), '////\r\nSome text\r\non\r\n////\r\n');
});

test('each selection gets its own comment', async () => {
    const editor = editorOn('first\nsecond\nthird\n', [
        { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 5 },
        { startLine: 2, startCharacter: 0, endLine: 2, endCharacter: 5 },
    ]);
    await toggleBlockCommentCommand();
    assert.equal(editor.result(), '////\nfirst\n////\nsecond\n////\nthird\n////\n');
});

test('two cursors in the same comment remove it once', async () => {
    // Both selections resolve to the same comment, and the second edit would
    // otherwise overlap the first -- which VS Code rejects outright, losing both.
    const editor = editorOn('////\nSome text\non\n////\n', [
        { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 0 },
        { startLine: 2, startCharacter: 0, endLine: 2, endCharacter: 0 },
    ]);
    await toggleBlockCommentCommand();
    assert.equal(editor.edited.length, 1);
    assert.equal(editor.result(), 'Some text\non\n');
});

test('it says so rather than editing a file that is not Alan', async () => {
    const editor = editorOn('some prose\n',
        [{ startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 4 }], 'markdown');
    said.length = 0;
    await toggleBlockCommentCommand();
    assert.equal(editor.edited.length, 0);
    assert.match(said[0], /Alan source file/);
});
