import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Selection, blockComments, toggleBlockComment } from './comments';

/**
 * Toggling an Alan block comment.
 *
 * <p>The rule these tests encode is the COMPILER's, read from alan.smk and confirmed
 * against the binary by the last test in this file: the opening `////` must stand in
 * the first column, and the comment ends only at a line that is slashes and nothing
 * else. VS Code's built-in Toggle Block Comment inserts its delimiters inline, so it
 * could never produce either -- which is the bug this command exists to fix.
 */

/** The edit, applied the way the editor applies it: one range, replaced wholesale. */
function toggled(text: string, selection: Selection): string {
    const lines = text.split('\n');
    const edit = toggleBlockComment(lines, selection);
    return [
        ...lines.slice(0, edit.firstLine),
        ...edit.lines,
        ...lines.slice(edit.lastLine + 1),
    ].join('\n');
}

/** The selection Robert made: four whole lines of prose. */
const PROSE = 'Some text on\na few lines\nthat continue\non\n';
const WHOLE_PROSE: Selection =
    { startLine: 0, startCharacter: 0, endLine: 3, endCharacter: 2 };

test('the delimiters go on lines of their own', () => {
    assert.equal(toggled(PROSE, WHOLE_PROSE),
        '////\nSome text on\na few lines\nthat continue\non\n////\n');
});

test('the closing delimiter is never appended to the last line of text', () => {
    // The reported bug, exactly: `on ////` does not close the comment, so
    // everything after it is swallowed to the end of the file.
    const lines = toggled(PROSE, WHOLE_PROSE).split('\n');
    assert.ok(lines.includes('on'), 'the last line of prose is still there, untouched');
    assert.ok(!lines.some(line => /\S\s*\/{4}/.test(line)),
        'no line carries a delimiter after other text');
});

test('a delimiter line is slashes and nothing else', () => {
    // Not even a trailing space: the scanner skips slashes and then demands the
    // end of the line, so `//// ` closes nothing.
    for (const line of [toggled(PROSE, WHOLE_PROSE).split('\n')[0],
                        toggled(PROSE, WHOLE_PROSE).split('\n')[5]]) {
        assert.match(line, /^\/{4}$/);
    }
});

test('a single line is wrapped in three', () => {
    assert.equal(toggled('one line\n', { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 8 }),
        '////\none line\n////\n');
});

test('a selection that only touches the next line does not take it', () => {
    // Dragging down the left margin ends the selection at column 0 of the line
    // AFTER the last one the author meant, exactly as it does for line comments.
    assert.equal(toggled('first\nsecond\nthird\n',
        { startLine: 0, startCharacter: 0, endLine: 1, endCharacter: 0 }),
        '////\nfirst\n////\nsecond\nthird\n');
});

test('toggling twice leaves the text as it was', () => {
    const commented = toggled(PROSE, WHOLE_PROSE);
    assert.equal(toggled(commented, { startLine: 0, startCharacter: 0, endLine: 5, endCharacter: 4 }),
        PROSE);
});

test('a cursor inside the comment uncomments it, delimiters and all', () => {
    // The delimiters are outside the selection, so finding them is the command's
    // job -- an author who put the cursor in the middle of a comment means that one.
    const text = '////\nSome text on\na few lines\n////\nStart at bedroom.\n';
    assert.equal(toggled(text, { startLine: 2, startCharacter: 1, endLine: 2, endCharacter: 1 }),
        'Some text on\na few lines\nStart at bedroom.\n');
});

test('text on the opening line survives being uncommented', () => {
    // `//// note` is legal: the rest of the opening line is inside the comment.
    const text = '//// a note\nSome text\n////\n';
    assert.equal(toggled(text, { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 9 }),
        'a note\nSome text\n');
});

test('an unterminated comment runs to the end of the file', () => {
    const text = 'The bedroom isa location.\n////\nSome text\non\n';
    assert.deepEqual(blockComments(text.split('\n')), [{ open: 1, close: undefined }]);
    assert.equal(toggled(text, { startLine: 2, startCharacter: 0, endLine: 2, endCharacter: 4 }),
        'The bedroom isa location.\nSome text\non\n');
});

test('four slashes are only a delimiter in the first column', () => {
    // The compiler says 156 E to an indented one, so it is not a comment we may
    // silently remove -- and `on ////` is text, not a closing delimiter.
    assert.deepEqual(blockComments(['  ////', 'Some text', 'on ////']), []);
});

test('a line of slashes inside a string is prose, not a delimiter', () => {
    // Alan strings run across lines, and what is inside one is content.
    const text = 'Description "a road\n//// and on\nit goes".\nEnd the.\n';
    assert.deepEqual(blockComments(text.split('\n')), []);
});

test('a delimiter cannot hide in a line comment', () => {
    assert.deepEqual(blockComments(['-- //// not a comment', 'still code']), []);
});

/**
 * The two files that used to carry the rule, and must no longer claim to.
 *
 * <p>The delimiters were declared to VS Code as an ordinary inline pair, and the
 * built-in command believed it. Nothing about that declaration was recoverable, so it
 * is gone -- and these are the detectors that keep it gone, because the entry looks
 * exactly like the one every other language has.
 */

test('the language configuration declares no block comment', () => {
    const config = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'language-configuration.json'), 'utf8'));
    assert.equal(config.comments.blockComment, undefined,
        'VS Code\'s built-in Toggle Block Comment inserts delimiters inline, which '
        + 'Alan cannot parse; alanif.toggleBlockComment replaces it');
    assert.equal(config.comments.lineComment, '--');
});

test('highlighting ends a block comment where the compiler ends it', () => {
    const grammar = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'syntaxes', 'alan.tmLanguage.json'), 'utf8'));
    const block = grammar.repository.comments.patterns
        .find((p: { name: string }) => p.name === 'comment.block.alanif');

    // Anchored, both ends. Unanchored, the colouring stops at `on ////` and the
    // author sees a comment that closed -- the one surface that could have told
    // Robert his file had gone wrong, agreeing with the bug instead.
    assert.equal(block.begin, '^////');
    assert.equal(block.end, '^/{4,}$');
});

/**
 * The rule, checked against the only authority there is.
 *
 * <p>Reading a scanner is not knowing what it accepts. This compiles what the
 * command produces, and skips -- loudly -- when there is no compiler to ask.
 */
const compiler = alanCompiler();

test('what the command produces compiles clean', { skip: compiler ? false
    : 'no Alan compiler: set ALAN_COMPILER or put alan on PATH' }, () => {
    const source = 'The bedroom isa location.\n  name \'the bedroom\'.\nEnd the bedroom.\n\n'
        + PROSE + 'Start at bedroom.\n';
    const selection: Selection = { startLine: 4, startCharacter: 0, endLine: 7, endCharacter: 2 };

    assert.deepEqual(errorsIn(toggled(source, selection)), []);

    // And the built-in's inline form, for contrast. It is not a near miss: the
    // comment never closes, so `Start at bedroom.` is swallowed too, and the
    // adventure loses its start.
    const builtIn = 'The bedroom isa location.\n  name \'the bedroom\'.\nEnd the bedroom.\n\n'
        + '//// Some text on\na few lines\nthat continue\non ////\nStart at bedroom.\n';
    assert.deepEqual(errorsIn(builtIn), ['155', '101', '211']);
});

function alanCompiler(): string | undefined {
    const configured = process.env.ALAN_COMPILER;
    if (configured && fs.existsSync(configured)) {
        return configured;
    }
    const found = cp.spawnSync('which', ['alan'], { encoding: 'utf8' });
    const first = found.stdout.split('\n')[0].trim();
    return first ? first : undefined;
}

/** The error codes the compiler reports for `text`, in the order it reports them. */
function errorsIn(text: string): string[] {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alan-comments-'));
    const file = path.join(dir, 'probe.alan');
    fs.writeFileSync(file, text, 'utf8');
    const run = cp.spawnSync(compiler!, ['-ide', '-encoding', 'utf8', file],
        { cwd: dir, encoding: 'utf8' });
    const output = `${run.stdout}${run.stderr}`;
    return [...output.matchAll(/: (\d+) [EW] :/g)].map(m => m[1]);
}
