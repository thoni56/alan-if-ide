import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
    columnOf, continuationIndent, lineOpensInsideAnotherString, rewrap, spanAt, stringSpans
} from './strings';

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

/**
 * $p and $n are the only structure an Alan string really has.
 *
 * Source line breaks mean nothing to the game; these markers mean a paragraph and a
 * line break in what the player reads. Laying the source out to match is free -- a
 * blank line inside a string is as invisible to the game as a single one, measured
 * both ways against a real transcript -- and it is what an author re-reading their own
 * prose actually wants to see.
 */

test('a paragraph marker starts a paragraph, with a blank line before it', () => {
    const literal = '"She zaps every piece of flesh she can get to. $pAfter a dozen shocks she vanishes."';
    const wrapped = rewrap(literal, 0, '  ', 60, 4);

    // The separating line carries nothing, not even the indent it sits in.
    assert.deepEqual(wrapped.split('\n'), [
        '"She zaps every piece of flesh she can get to.',
        '',
        '  $pAfter a dozen shocks she vanishes."',
    ]);
});

test('a marker with no space before it still starts its own paragraph', () => {
    // Authors write it both ways, and the game cannot tell the difference either.
    const wrapped = rewrap('"...she can get to.$pAfter a dozen shocks."', 0, '  ', 60, 4);
    assert.match(wrapped, /get to\.\n\n {2}\$pAfter/);
});

test('a string that opens with a marker gains no leading blank line', () => {
    // There is nothing before it to be separated from.
    const wrapped = rewrap('"$pAfter setting you down, Kassi sits down."', 0, '  ', 60, 4);
    assert.equal(wrapped, '"$pAfter setting you down, Kassi sits down."');
});

test('a line-break marker breaks the line without a blank one', () => {
    const wrapped = rewrap('"Nick Wayne, I presume.$nHe says as you shake hands."', 0, '  ', 60, 4);

    assert.deepEqual(wrapped.split('\n'), [
        '"Nick Wayne, I presume.',
        '  $nHe says as you shake hands."',
    ]);
});

test('each paragraph is filled to the width in its own right', () => {
    const wrapped = rewrap('"one two three four five $psix seven eight nine ten"', 0, '  ', 22, 4);

    assert.deepEqual(wrapped.split('\n'), [
        '"one two three four',
        '  five',
        '',
        '  $psix seven eight',
        '  nine ten"',
    ]);
});

test('a line that opens inside another string is left where it stands', () => {
    // ... the "Style alert. "Grotto" Style normal. "before you go...
    // The second literal shares a line with the FIRST one's interior, so moving it
    // would break a line in the middle of someone else's string.
    const text = 'Description "one\ntwo " Style alert. "three\nfour"\n';
    const spans = stringSpans(text);
    const second = spans[spans.length - 1];
    assert.equal(lineOpensInsideAnotherString(text, spans, second.start), true);
    assert.equal(lineOpensInsideAnotherString(text, spans, spans[0].start), false);
});

test('a space at either end of a literal is content, and survives', () => {
    // Adjacent strings and statements print with nothing between them, so authors put
    // a space INSIDE the quotes to separate them. Collapsing it changes the game.
    // Found by re-wrapping all 5261 strings of a real 83-file game and diffing the
    // transcript: two lines came back changed, and both were an edge space.
    assert.equal(rewrap('" you say to yourself."', 0, '  ', 60, 4), '" you say to yourself."');
    assert.equal(rewrap('"...over the land. "', 0, '  ', 60, 4), '"...over the land. "');
    assert.equal(rewrap('" both ends "', 0, '  ', 60, 4), '" both ends "');
    // Alan escapes a quote by doubling it, and that is content like any other.
    assert.equal(rewrap('"He said ""no"" firmly. "', 0, '  ', 60, 4), '"He said ""no"" firmly. "');
});

test('but whitespace between words is still ours to re-flow', () => {
    assert.equal(rewrap('"one     two\n\n   three"', 0, '  ', 60, 4), '"one two three"');
});

/**
 * The quote hangs; the prose lines up.
 *
 * Getting this wrong is invisible to the game and glaring to the author, which makes
 * it exactly the kind of layout rule worth pinning down here rather than by eye.
 */
test('a string that owns its line puts the prose, not the quote, in the column', () => {
    // Eight spaces of indent, so the quote is at column 8 and every line of text --
    // the first included -- starts at column 9.
    assert.equal(continuationIndent('        ', 8, '    ', 4), '         ');

    const wrapped = rewrap('"one two three four five six seven eight"', 8,
        continuationIndent('        ', 8, '    ', 4), 30, 4);
    // Both lines fill to the same column, because both start at the same one: the
    // opening quote is paid for out of the margin, not out of the first line.
    assert.deepEqual(wrapped.split('\n'), [
        '"one two three four',
        '         five six seven eight"',
    ]);
});

test('a string that does not own its line falls back to a plain indent', () => {
    // Alan prose is interrupted and resumed, so a literal can open at column 60 on a
    // line it shares. Hanging under THAT would leave nowhere to write.
    assert.equal(continuationIndent('    ', 60, '    ', 4), '        ');
});

test('the hanging indent is spaces even when the file is indented with tabs', () => {
    // A tab cannot express "one column right of the quote", and the alignment is the
    // point. The line's own indentation is still left exactly as the author wrote it.
    assert.equal(continuationIndent('\t\t', 8, '\t', 4), '\t\t ');
});
