import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
    ALL_LANGUAGES, BUNDLED, CSPELL_EXTENSION, LANGUAGES, CONCORDANCE_FILE,
    briefFor, languagesFor, gitignoreFor, languageNames,
    describeSpellChecking, SpellCheckingFacts,
} from './cspell';
import { ALAN_PATTERNS, CODE_DICTIONARIES } from './spelling';

/**
 * The brief an author ends up with, which is the only part of this feature they can
 * be harmed by: it lands in their game folder, next to their manuscript, and it holds
 * the glossary -- the words cSpell's own "Add to dictionary" keeps for them.
 */

function parse(text: string): any {
    return JSON.parse(text);
}

function fresh(languages = ['en']): any {
    const brief = briefFor(undefined, languages);
    assert.equal(brief.ok, true);
    return parse((brief as { ok: true; text: string }).text);
}

test('a fresh brief carries the rules the measurement proved', () => {
    const c = fresh();
    // Scoped to the language, never top-level: top-level include patterns would check
    // the author's README only inside its quotation marks.
    assert.equal(c.languageSettings.length, 1);
    const alan = c.languageSettings[0];
    assert.equal(alan.languageId, 'alanif');
    assert.deepEqual(alan.includeRegExpList, ['alan-string']);
    assert.deepEqual(alan.ignoreRegExpList, ['alan-marker', 'alan-glued']);
    assert.deepEqual(c.patterns, ALAN_PATTERNS);

    // The programming stack is off, because `teh` is a valid word in cSpell's AWS
    // dictionary and an author writing a novel should not inherit that.
    CODE_DICTIONARIES.forEach(d => assert.ok(alan.dictionaries.includes(`!${d}`), d));

    // The concordance is never the target of "Add to dictionary": a word added
    // there would vanish at the next rebuild, silently.
    assert.deepEqual(c.dictionaryDefinitions, [
        { name: 'alan-concordance', path: `./${CONCORDANCE_FILE}`, addWords: false }]);
    assert.ok(alan.dictionaries.includes('alan-concordance'));
    // And `words` is present and empty, which is where cSpell puts them instead.
    assert.deepEqual(c.words, []);
});

test('the chosen languages become cSpell\'s language, and nothing means English', () => {
    assert.equal(fresh(['en']).language, 'en');
    assert.equal(fresh(['en', 'it']).language, 'en,it');
    // An empty setting would leave cSpell checking against no dictionary at all.
    assert.equal(fresh([]).language, 'en');
});

test('the author\'s own file survives being merged into', () => {
    const theirs = JSON.stringify({
        version: '0.2',
        words: ['Aerrowan', 'wyldkynd'],
        ignorePaths: ['build/**'],
        language: 'en',
    });
    const merged = parse((briefFor(theirs, ['it']) as any).text);

    assert.deepEqual(merged.words, ['Aerrowan', 'wyldkynd'], 'their added words');
    assert.deepEqual(merged.ignorePaths, ['build/**'], 'a key we know nothing about');
    assert.equal(merged.language, 'it', 'the language they just chose');
    assert.equal(merged.languageSettings.length, 1);
});

test('running it twice produces the same file, not two of everything', () => {
    const once = (briefFor(undefined, ['en']) as any).text;
    const twice = (briefFor(once, ['en']) as any).text;
    assert.equal(twice, once);

    // And the same holds when the languages change: ours are replaced, not stacked.
    const changed = parse((briefFor(once, ['en', 'sv']) as any).text);
    assert.equal(changed.patterns.length, ALAN_PATTERNS.length);
    assert.equal(changed.languageSettings.length, 1);
    assert.equal(changed.dictionaryDefinitions.length, 1);
    assert.equal(changed.language, 'en,sv');
});

test('a pattern of the author\'s own is kept beside ours', () => {
    const theirs = JSON.stringify({
        patterns: [{ name: 'their-thing', pattern: '/x/g' }],
        languageSettings: [{ languageId: 'markdown', dictionaries: ['softwareTerms'] }],
    });
    const merged = parse((briefFor(theirs, ['en']) as any).text);

    assert.ok(merged.patterns.some((p: any) => p.name === 'their-thing'));
    assert.equal(merged.patterns.length, ALAN_PATTERNS.length + 1);
    assert.ok(merged.languageSettings.some((s: any) => s.languageId === 'markdown'));
    assert.equal(merged.languageSettings.length, 2);
});

test('a file we cannot understand is refused, not overwritten', () => {
    // This is where an author's own words live. Guessing at it is worse than stopping.
    const broken = briefFor('{ "words": [ // a comment cSpell allows\n] }', ['en']);
    assert.equal(broken.ok, false);
    assert.match((broken as any).reason, /not valid JSON/);

    const wrongShape = briefFor('{ "patterns": "all of them" }', ['en']);
    assert.equal(wrongShape.ok, false);
    assert.match((wrongShape as any).reason, /"patterns" is not a list/);

    assert.equal(briefFor('[]', ['en']).ok, false, 'an array is not a brief');
});

test('the concordance is gitignored once, however the entry is written', () => {
    assert.match(gitignoreFor(undefined)!, new RegExp(`^\\n#.*\\n/${CONCORDANCE_FILE}\\n$`));

    const added = gitignoreFor('build/\n')!;
    assert.ok(added.startsWith('build/\n'), 'what was there is kept');
    assert.ok(added.endsWith(`/${CONCORDANCE_FILE}\n`));

    // Already covered, in either spelling: leave the file alone.
    assert.equal(gitignoreFor(`build/\n/${CONCORDANCE_FILE}\n`), undefined);
    assert.equal(gitignoreFor(`${CONCORDANCE_FILE}\n`), undefined);
    // And adding it is idempotent, since the command doubles as the read-through.
    assert.equal(gitignoreFor(added), undefined);

    assert.ok(gitignoreFor('build/')!.startsWith('build/\n'), 'a missing newline');
});

test('English is the one language that costs nothing, and the list says so', () => {
    // The whole reason the picker pins it: cSpell bundles English and nothing else,
    // so every other choice is an install. If that ever stops being true here, the
    // picker's headings become a lie.
    assert.equal(BUNDLED.extension, undefined);
    assert.equal(LANGUAGES.filter(d => d.extension === undefined).length, 0);
    assert.equal(ALL_LANGUAGES.length, LANGUAGES.length + 1);
});

test('every language is distinct and names a real extension', () => {
    const codes = ALL_LANGUAGES.map(d => d.code);
    assert.equal(new Set(codes).size, codes.length, 'no duplicate language codes');
    const names = ALL_LANGUAGES.map(d => d.name);
    assert.equal(new Set(names).size, names.length, 'no duplicate names');

    for (const d of LANGUAGES) {
        assert.ok(d.extension!.startsWith(`${CSPELL_EXTENSION}-`), d.name);
        assert.match(d.code, /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/, d.name);
    }
    // Sorted, so the picker is a catalogue an author can scan rather than a heap.
    assert.deepEqual(names.slice(1), [...names.slice(1)].sort((a, b) => a.localeCompare(b)));
});

test('the languages are named back to the author the way they chose them', () => {
    assert.equal(languageNames(['en']), 'English');
    assert.equal(languageNames(['en', 'it']), 'English and Italian');
    assert.equal(languageNames(['en', 'it', 'sv']), 'English, Italian and Swedish');
    assert.equal(languageNames([]), 'English');

    // What the install offer is built from: English is never among them.
    assert.deepEqual(languagesFor(['en', 'it']).map(d => d.name), ['English', 'Italian']);
    assert.deepEqual(
        languagesFor(['en', 'it']).filter(d => d.extension !== undefined).map(d => d.code),
        ['it']);
});

/**
 * WHAT CHECK SETUP SAYS ABOUT SPELL CHECKING.
 *
 * Robert asked for a per-project dictionary that already existed, was told its name
 * in bold, said "I will try it right now", and went on adding his own locations to
 * the GLOBAL dictionary by hand. None of the three explanations -- ran it in another
 * folder, dismissed the modal, never got to it -- can be told apart from the outside,
 * and asking an author to run experiments to find out is the wrong way round.
 *
 * So the state becomes visible on the surface that already answers "what is my
 * setup?". The rule this instance of: ANYTHING AN AUTHOR MIGHT HAVE TO SET UP
 * BELONGS IN CHECK SETUP.
 *
 * Not being set up is NOT a fault -- spell checking is optional and an author who
 * never wanted it must not be nagged. Being set up and not working IS one, because
 * the author asked for the thing and is not getting it.
 */

test('no folder open: the question cannot be answered, and that is not a fault', () => {
    const r = describeSpellChecking({ extensionInstalled: true, brief: false });
    assert.equal(r.attention, false);
    assert.equal(r.action, 'open-folder');
    assert.match(r.detail, /folder/i);
});

test('never set up here: an invitation, not a warning', () => {
    const r = describeSpellChecking(
        { folder: 'wyldkynd', extensionInstalled: true, brief: false });
    assert.equal(r.attention, false);
    assert.equal(r.action, 'setup');
    assert.match(r.text, /not set up/i);
    // The folder is named because per-folder is the whole point: an author who set it
    // up once, elsewhere, reads a bare "not set up" as wrong.
    assert.match(r.text, /wyldkynd/);
});

test('set up and collecting: the reassuring case says how many names', () => {
    const r = describeSpellChecking(
        { folder: 'wyldkynd', extensionInstalled: true, brief: true, names: 1240 });
    assert.equal(r.attention, false);
    assert.match(r.text, /wyldkynd/);
    assert.match(r.detail, /1240/);
});

test('set up but no names collected: that is a fault, because it was asked for', () => {
    const r = describeSpellChecking(
        { folder: 'wyldkynd', extensionInstalled: true, brief: true, names: 0 });
    assert.equal(r.attention, true);
    assert.equal(r.action, 'setup');
});

test('set up but the concordance is missing entirely: also a fault', () => {
    const r = describeSpellChecking(
        { folder: 'wyldkynd', extensionInstalled: true, brief: true });
    assert.equal(r.attention, true);
    assert.equal(r.action, 'setup');
});

test('opted in, but cSpell is not installed: inert, and the author cannot see why', () => {
    const r = describeSpellChecking(
        { folder: 'wyldkynd', extensionInstalled: false, brief: true, names: 1240 });
    assert.equal(r.attention, true);
    assert.equal(r.action, 'install-extension');
});

test('cSpell missing and never opted in: nothing was asked for, so nothing is wrong', () => {
    const r = describeSpellChecking(
        { folder: 'wyldkynd', extensionInstalled: false, brief: false });
    assert.equal(r.attention, false);
});

/**
 * THE SAME ANSWER, ABBREVIATED, FOR THE LANGUAGE STATUS BUBBLE.
 *
 * Two surfaces, two questions (status.ts): the bubble answers "what is my setup?" and
 * the Check Setup quick pick holds the full, untruncated truth. Spell checking reached
 * the second and not the first, so an author who looked where the other four rows live
 * found cSpell's own item instead of ours and reasonably concluded nothing had changed.
 *
 * <p>ONE describer feeds both, so the two surfaces cannot drift into disagreeing about
 * a folder -- which is the failure this whole row exists to prevent.
 *
 * <p>"Not set up" must NOT say "off": cSpell is running and checking the author's
 * English, and what is missing is only their game's own vocabulary. Saying the feature
 * is off would be a plain lie about what they are looking at.
 */

test('the bubble text is short enough for a narrow popup', () => {
    const states: SpellCheckingFacts[] = [
        { extensionInstalled: true, brief: false },
        { folder: 'wyldkynd', extensionInstalled: true, brief: false },
        { folder: 'wyldkynd', extensionInstalled: true, brief: true, names: 962 },
        { folder: 'wyldkynd', extensionInstalled: true, brief: true, names: 0 },
        { folder: 'wyldkynd', extensionInstalled: true, brief: true },
        { folder: 'wyldkynd', extensionInstalled: false, brief: true, names: 962 },
    ];
    for (const facts of states) {
        const { short } = describeSpellChecking(facts);
        assert.ok(short.length <= 34, `too long for the bubble: ${short}`);
        // The folder belongs in the detail line, not in the abbreviated text: the
        // popup cannot be widened and a long game name would push the state off it.
        assert.ok(!short.includes('wyldkynd'), `the folder must not be in: ${short}`);
    }
});

test('set up: the bubble carries the number, which is the whole answer', () => {
    const r = describeSpellChecking(
        { folder: 'wyldkynd', extensionInstalled: true, brief: true, names: 962 });
    assert.match(r.short, /962/);
});

test('not set up never claims spell checking is off, because cSpell is still running', () => {
    const r = describeSpellChecking(
        { folder: 'wyldkynd', extensionInstalled: true, brief: true, names: 962 });
    const not = describeSpellChecking(
        { folder: 'wyldkynd', extensionInstalled: true, brief: false });
    assert.doesNotMatch(not.short, /\boff\b/i);
    assert.match(not.short, /not set up/i);
    assert.notEqual(not.short, r.short);
});
