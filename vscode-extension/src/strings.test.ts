import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { columnOf, rewrap, spanAt, stringSpans } from './strings';

/**
 * Finding strings, and re-flowing them.
 *
 * The reason this is safe at all is measured, not assumed: an Alan string prints as
 * one flowed paragraph, with source newlines and indentation collapsed to a single
 * space and the interpreter wrapping to the player's terminal. So every assertion here
 * is about layout in the source, and none of it can reach the game's output.
 */

test('a quote inside a comment is not a string', () => {
    const text = '-- he said "hello" and left\nThe hall Isa location.\n';
    assert.deepEqual(stringSpans(text), []);
});

test('nor is one inside a block comment', () => {
    assert.deepEqual(stringSpans('//// a " in here ////\n'), []);
});

test('nor is one inside a quoted id, which may legally contain quotes', () => {
    // QUOTED_ID: "'" ( "''" | !("'") )* "'" -- so this ' ... ' swallows the quote.
    assert.deepEqual(stringSpans("Import 'lib\"odd.i'.\n"), []);
});

test('a doubled quote is a literal one, not the end of the string', () => {
    const text = 'Description "he said ""hello"" and left".\n';
    const spans = stringSpans(text);
    assert.equal(spans.length, 1, 'the string was cut short at the escaped quote');
    assert.equal(text.slice(spans[0].start, spans[0].end), '"he said ""hello"" and left"');
});

test('the cursor resting anywhere in a string finds it, including on its quotes', () => {
    const text = 'Description "some prose here".\n';
    const spans = stringSpans(text);
    assert.equal(spanAt(spans, text.indexOf('prose')), spans[0]);
    assert.equal(spanAt(spans, text.indexOf('"')), spans[0]);
    assert.equal(spanAt(spans, 0), undefined);
});

test('a tab counts to the next tab stop, not as one column', () => {
    assert.equal(columnOf('\t\tx', 2, 4), 8);
    assert.equal(columnOf('  x', 2, 4), 2);
});

test('a long string is filled to the width and indented underneath', () => {
    const literal = '"one two three four five six seven eight nine ten"';
    const wrapped = rewrap(literal, 4, '      ', 24, 4);

    assert.deepEqual(wrapped.split('\n'), [
        '"one two three four',
        '      five six seven',
        '      eight nine ten"',
    ]);
});

test('the newlines the author wrote are just whitespace, and are re-decided', () => {
    // Which is the whole point: their placement means nothing to the game, so a
    // command that moves them cannot break anything.
    const literal = '"one\n        two\n        three four"';
    assert.equal(rewrap(literal, 0, '  ', 40, 4), '"one two three four"');
});

test('a word longer than the width overflows rather than being broken', () => {
    // Breaking mid-word would be the one edit here that a reader could not undo by eye.
    const literal = '"supercalifragilistic"';
    assert.equal(rewrap(literal, 0, '  ', 10, 4), '"supercalifragilistic"');
});

test('markers are words, so a break never lands inside one', () => {
    // $p and $n carry the real structure, and have no whitespace inside them, so a
    // wrapper that breaks only at whitespace cannot land in the middle of one.
    const wrapped = rewrap('"first.$pSecond part follows on"', 0, '  ', 16, 4);
    assert.match(wrapped, /\$pSecond/, 'a marker was split from the word it is joined to');
    assert.ok(wrapped.includes('\n'), 'this input should have wrapped at all');
});

test('a string of only whitespace is left exactly as it is', () => {
    assert.equal(rewrap('"   "', 0, '  ', 40, 4), '"   "');
});
