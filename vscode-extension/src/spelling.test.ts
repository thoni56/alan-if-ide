import { test } from 'node:test';
import * as assert from 'node:assert';
import { projectWords, dictionaryFile, ALAN_PATTERNS, ALAN_INCLUDE, ALAN_IGNORE } from './spelling';

test('the words an author types are collected, and the programmer\'s are not', () => {
    const words = projectWords(`
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
    const words = projectWords("The night_stand Isa object\n  Name night stand Name 'bedside table'\nEnd The.");
    assert.deepStrictEqual(words, ['bedside', 'night', 'stand', 'table']);
});

test('a quoted id keeps its word, not its quotes', () => {
    assert.deepStrictEqual(projectWords("Verb 'show'\nEnd Verb."), ['show']);
});

test('prose is not a source of dictionary words', () => {
    // The whole point: the dictionary comes from what the author DECLARED, never from
    // what they wrote. A misspelling in a string must stay a misspelling.
    const words = projectWords('The lamp Isa object\n  Description "The lamp is a wyldkynd artifact."\nEnd The.');
    assert.deepStrictEqual(words, ['lamp']);
});

test('a quote inside a comment does not start a string, and -- inside one is not a comment', () => {
    const words = projectWords([
        '-- The "shiny" lamp -- a note',
        'The gadget Isa object',
        '  Description "A well-made -- some say shiny -- gadget."',
        'End The.',
        'The widget Isa object',
    ].join('\n'));
    assert.deepStrictEqual(words, ['gadget', 'widget']);
});

test('synonyms and exits are collected; both are words a player types', () => {
    const words = projectWords('Synonyms lampada, lanterna = lamp.\nExit northeast, sudest to hall');
    ['lampada', 'lanterna', 'northeast', 'sudest'].forEach(
        w => assert.ok(words.includes(w), `${w} should be in the dictionary`));
});

test('the generated file says it is generated, and where the author\'s own words go', () => {
    const file = dictionaryFile(['aerrowan', 'wyldkynd']);
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

test('a word glued to $$ is a fragment, and is not checked', () => {
    const glued = ALAN_PATTERNS.find(p => p.name === 'alan-glued')!;
    const body = glued.pattern.replace(/^\//, '').replace(/\/g$/, '');
    assert.deepStrictEqual('Lo spiraglio chius$$'.replace(new RegExp(body, 'g'), ''), 'Lo spiraglio ');
});
