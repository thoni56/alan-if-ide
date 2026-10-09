import { test } from 'node:test';
import * as assert from 'node:assert';
import { contribution, concordanceText, ALAN_PATTERNS, ALAN_INCLUDE, ALAN_IGNORE } from './spelling';
import { stringSpans } from './strings';

test('the words an author types are collected, and the programmer\'s are not', () => {
    const words = contribution(`
        Every wyldkynd Isa actor
          Is describedAs "".
          Has feetcover 0.
        End Every.
        The aerrowan Isa wyldkynd
          Name Aerrowan Name 'merman'
          Description "Aerrowan waits."
        End The.
        Verb xyzzy, plugh
          Does "Nothing happens."
        End Verb.
        Script hourly_check
        Event dispay_check
    `);
    // Player-facing: the class, the instance, its Names, the verbs.
    ['wyldkynd', 'aerrowan', 'merman', 'xyzzy', 'plugh'].forEach(
        w => assert.ok(words.includes(w), `${w} should be in the dictionary`));
    // Programmer-facing: an attribute, a script, an event. Every one of these would
    // make a real typo permanently correct in every string of the game.
    ['describedas', 'feetcover', 'hourly', 'dispay'].forEach(
        w => assert.ok(!words.includes(w), `${w} should NOT be in the dictionary`));
});

test('a name is split the way prose would use it, and short fragments go', () => {
    const words = contribution("The night_stand Isa object\n  Name night stand Name 'bedside table'\nEnd The.");
    assert.deepStrictEqual(words, ['bedside', 'night', 'stand', 'table']);
});

test('a quoted id keeps its word, not its quotes', () => {
    assert.deepStrictEqual(contribution("Verb 'show'\nEnd Verb."), ['show']);
});

test('prose contributes nothing; only declarations do', () => {
    // The whole point: the dictionary comes from what the author DECLARED, never from
    // what they wrote. A misspelling in a string must stay a misspelling.
    const words = contribution('The lamp Isa object\n  Description "The lamp is a wyldkynd artifact."\nEnd The.');
    assert.deepStrictEqual(words, ['lamp']);
});

test('a quote inside a comment does not start a string, and -- inside one is not a comment', () => {
    const words = contribution([
        '-- The "shiny" lamp -- a note',
        'The gadget Isa object',
        '  Description "A well-made -- some say shiny -- gadget."',
        'End The.',
        'The widget Isa object',
    ].join('\n'));
    assert.deepStrictEqual(words, ['gadget', 'widget']);
});

test('synonyms and exits are collected; both are words a player types', () => {
    const words = contribution('Synonyms lampada, lanterna = lamp.\nExit northeast, sudest to hall');
    ['lampada', 'lanterna', 'northeast', 'sudest'].forEach(
        w => assert.ok(words.includes(w), `${w} should be in the dictionary`));
});

test('the concordance says it is generated, and points at the glossary', () => {
    const file = concordanceText(['aerrowan', 'wyldkynd']);
    assert.match(file, /^# Written by Alan IF IDE/);
    assert.match(file, /cspell\.json/);
    assert.ok(file.endsWith('aerrowan\nwyldkynd\n'));
});

test('the patterns keep a marker from swallowing the word after it', () => {
    // $pand must not reach the checker as "pand" -- the failure that would flag every
    // paragraph in the game. Verified against the real cSpell before being encoded.
    const marker = ALAN_PATTERNS.find(p => p.name === 'alan-marker')!;
    const body = marker.pattern.replace(/^\//, '').replace(/\/g$/, '');
    assert.deepStrictEqual('$pand the shadows'.replace(new RegExp(body, 'g'), ' '), ' and the shadows');
    assert.deepStrictEqual(ALAN_INCLUDE, ['alan-string']);
    assert.deepStrictEqual(ALAN_IGNORE, ['alan-marker', 'alan-glued']);
});

test('a quote inside a comment does not invert the rest of the file', () => {
    // THE FIELD REPORT: spell checking "stopped working" in one file, and the cause was
    // this line of it. cSpell pairs quotes with a regex, so the unbalanced quote in the
    // comment used to swallow the real string after it and shift every quote below --
    // checking the code and skipping the prose, with no squiggle anywhere to say so.
    const source = '\t-- "$t$t$t\n\t"Prologue"\n\t"It is late at night."\n';
    assert.deepStrictEqual(
        stringsMatched(source), ['"Prologue"', '"It is late at night."']);

    // The lexer in strings.ts is the specification, so the pattern is held to it.
    assert.deepStrictEqual(
        stringsMatched(source),
        stringSpans(source).map(s => source.slice(s.start, s.end)));
});

test('a dash inside prose is prose, not the start of a comment', () => {
    // Alan authors use -- as an em dash and as a rule across the screen, so a pattern
    // that treated every -- as a comment would stop checking the prose that follows it.
    for (const source of [
        '"$p$t------Exits------"\n',
        '"Redicia flowers -- Attraction\n more -- Repulsion"\n',
        '"$nNORTH --> open doorway"\n',
    ]) {
        assert.deepStrictEqual(
            stringsMatched(source),
            stringSpans(source).map(s => source.slice(s.start, s.end)),
            source);
    }
});

/** What cSpell would check: the `alan-string` pattern applied as cSpell applies it. */
function stringsMatched(source: string): string[] {
    const string = ALAN_PATTERNS.find(p => p.name === 'alan-string')!;
    const body = string.pattern.replace(/^\//, '').replace(/\/g$/, '');
    return source.match(new RegExp(body, 'g')) ?? [];
}

test('a word glued to $$ is a fragment, and is not checked', () => {
    const glued = ALAN_PATTERNS.find(p => p.name === 'alan-glued')!;
    const body = glued.pattern.replace(/^\//, '').replace(/\/g$/, '');
    assert.deepStrictEqual('Lo spiraglio chius$$'.replace(new RegExp(body, 'g'), ''), 'Lo spiraglio ');
});
