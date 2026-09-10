import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
    ALL_LANGUAGES, BUNDLED, CSPELL_EXTENSION, LANGUAGES, CONCORDANCE_FILE,
    briefFor, languagesFor, gitignoreFor, languageNames,
    describeSpellChecking, SpellCheckingFacts, fileTypeDisabledBy, fileTypeDisabledIn,
    fileTypeDisabledInBrief, fileTypeDisabledFor, wordListIsStale,
    describePlan, EDITOR_SETTINGS,
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
        { folder: 'wyldkynd', extensionInstalled: true, brief: true, names: 962,
            fileTypeDisabled: true },
        { folder: 'wyldkynd', extensionInstalled: true, brief: true, names: 962,
            wordListStale: true },
    ];
    for (const facts of states) {
        const { short } = describeSpellChecking(facts);
        assert.ok(short.length <= 34, `too long for the bubble: ${short}`);
        // OURS, NOT cSPELL'S. cSpell puts its own row in the same bubble, for every
        // file type, and an author who mixes the two would take our answer about their
        // game for a claim about the checker itself.
        assert.ok(short.startsWith('Alan '), `does not say whose it is: ${short}`);
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


/**
 * SET UP, AND SWITCHED OFF UNDERNEATH -- the state the row could not see.
 *
 * <p>cSpell's own Actions Menu leads with `Disable File Type: alanif`, already
 * highlighted, and one stray Enter writes `alanif: false` into
 * `cSpell.enabledFileTypes`. That beats the `{"*": true}` default our brief relies on,
 * and our brief writes nothing that enables the file type. Both files stay on disk, so
 * the row went on saying "set up in <folder>, 962 names" while nothing was checked --
 * an author who asked for this, is not getting it, and is being told they are.
 *
 * <p>WE READ ONE THING AND FAIL TOWARD SILENCE. Three settings can decide whether a
 * file type is checked, the setting is `scope: resource`, and how VS Code merges object
 * settings across scopes is not something we have verified. Reproducing cSpell's
 * resolution would build the same class of bug in a new place, so an explicit
 * `alanif: false` is the only thing we call disabled. Everything else stays quiet.
 */

test('an explicit alanif:false is the one thing we call disabled', () => {
    assert.equal(fileTypeDisabledBy({ alanif: false }), true);
});

test('anything short of that explicit false leaves the row alone', () => {
    // Nothing to read: the setting is unset, or empty, or cSpell's own default.
    assert.equal(fileTypeDisabledBy(undefined), false);
    assert.equal(fileTypeDisabledBy({}), false);
    assert.equal(fileTypeDisabledBy({ '*': true, markdown: true }), false);
    // Enabled outright.
    assert.equal(fileTypeDisabledBy({ alanif: true }), false);
    // A blanket false says nothing about us, and resolving what it means for Alan
    // files is exactly the resolution we decided not to reproduce.
    assert.equal(fileTypeDisabledBy({ '*': false }), false);
    // The legacy array form (`enableFiletypes: ["!alanif"]`) is a different setting
    // and is deliberately not resolved here.
    assert.equal(fileTypeDisabledBy(['!alanif']), false);
    // Junk, from a hand-edited settings file.
    assert.equal(fileTypeDisabledBy('alanif'), false);
    assert.equal(fileTypeDisabledBy(null), false);
});

test('set up but the file type is off: they asked for it and are not getting it', () => {
    const r = describeSpellChecking({
        folder: 'wyldkynd', extensionInstalled: true, brief: true, names: 962,
        fileTypeDisabled: true,
    });
    assert.equal(r.attention, true);
    assert.equal(r.action, 'enable-file-type');
    assert.match(r.text, /wyldkynd/);
    assert.match(r.text, /not being checked/i);
    // The count is true and beside the point: saying "962 names" here is the lie the
    // row was telling before.
    assert.doesNotMatch(r.short, /962/);
});

test('the file type beats the name-count faults, being the reason nothing happens', () => {
    const none = describeSpellChecking({
        folder: 'wyldkynd', extensionInstalled: true, brief: true, names: 0,
        fileTypeDisabled: true,
    });
    assert.equal(none.action, 'enable-file-type');
    const missing = describeSpellChecking({
        folder: 'wyldkynd', extensionInstalled: true, brief: true,
        fileTypeDisabled: true,
    });
    assert.equal(missing.action, 'enable-file-type');
});

test('cSpell not installed outranks it, since enabling a file type would do nothing', () => {
    const r = describeSpellChecking({
        folder: 'wyldkynd', extensionInstalled: false, brief: true, names: 962,
        fileTypeDisabled: true,
    });
    assert.equal(r.action, 'install-extension');
});

test('never set up here: a disabled file type is still nothing to warn about', () => {
    const r = describeSpellChecking({
        folder: 'wyldkynd', extensionInstalled: true, brief: false,
        fileTypeDisabled: true,
    });
    assert.equal(r.attention, false);
    assert.equal(r.action, 'setup');
});


/**
 * WHICH SCOPE DECIDES -- and the merge question we are not going to guess at.
 *
 * `cSpell.enabledFileTypes` is `scope: resource`, so the same key can be set in user,
 * workspace and folder settings at once. Whether VS Code deep-merges object settings
 * across those levels or lets the nearest one replace the rest is not something we have
 * verified, and building on the wrong answer would put this same bug in a new place.
 *
 * <p>So the nearest scope that sets the key AT ALL decides, and only an `alanif: false`
 * in that one is disabled. Under the replace reading that is exactly right. Under the
 * merge reading it can miss a `false` set further out, and the row then says what it
 * said before, which is the failure we can afford.
 */

test('the folder decides when the folder sets it', () => {
    assert.equal(fileTypeDisabledIn({ workspaceFolderValue: { alanif: false } }), true);
    assert.equal(fileTypeDisabledIn({
        workspaceFolderValue: { alanif: true },
        workspaceValue: { alanif: false },
    }), false);
});

test('a nearer scope that says nothing about Alan files silences a further one', () => {
    assert.equal(fileTypeDisabledIn({
        workspaceFolderValue: { '*': true },
        workspaceValue: { alanif: false },
    }), false);
});

test('a further scope decides when no nearer one sets the key', () => {
    assert.equal(fileTypeDisabledIn({ workspaceValue: { alanif: false } }), true);
    assert.equal(fileTypeDisabledIn({ globalValue: { alanif: false } }), true);
    assert.equal(fileTypeDisabledIn({
        workspaceValue: { '*': true },
        globalValue: { alanif: false },
    }), false);
});

test('nothing set anywhere is not a fault', () => {
    assert.equal(fileTypeDisabledIn({}), false);
    assert.equal(fileTypeDisabledIn(undefined), false);
});


/**
 * AND THE PLACE IT ACTUALLY GETS WRITTEN -- the brief itself.
 *
 * Observed 2026-09-09, taking `Disable File Type: alanif` from cSpell's Actions Menu:
 * it does not just write the setting, it ASKS where to put it, offering cspell.json,
 * workspace and user. Choosing cspell.json wrote `"enabledFileTypes": {"alanif":
 * false}` into the game's own brief, where no amount of reading VS Code settings will
 * ever find it -- and the row went on saying "962 names" while nothing was checked.
 *
 * <p>For these authors the brief is the likely pick: it is the file our setup command
 * puts in their folder, and it is the one offered first.
 */

test('the brief can hold the disable, and that counts', () => {
    assert.equal(fileTypeDisabledInBrief(
        '{"enabledFileTypes": {"alanif": false}}'), true);
});

test('an ordinary brief says nothing about it', () => {
    assert.equal(fileTypeDisabledInBrief('{"words": ["wyldkynd"]}'), false);
    assert.equal(fileTypeDisabledInBrief(
        '{"enabledFileTypes": {"alanif": true}}'), false);
    assert.equal(fileTypeDisabledInBrief('{}'), false);
});

test('an unreadable or missing brief is not a claim about anything', () => {
    // Half-typed JSON, which is the state a hand-edited file spends time in.
    assert.equal(fileTypeDisabledInBrief('{"enabledFileTypes": {'), false);
    assert.equal(fileTypeDisabledInBrief(''), false);
    assert.equal(fileTypeDisabledInBrief(undefined), false);
});


/**
 * WHICH SOURCE WINS -- measured in the editor, not reasoned about.
 *
 * Observed 2026-09-09, second round trip: `Disable File Type` written to WORKSPACE
 * settings while the brief already said `"alanif": true`. cSpell went on checking, and
 * the row said "not checked". A false positive, which is the one failure this state
 * was built to avoid: telling an author their setup is broken when it is not.
 *
 * <p>So the brief decides whenever it says anything about Alan files, and VS Code's
 * settings decide only when it is silent. That is what the editor did, and the two
 * places disagreeing is not hypothetical -- one round trip through cSpell's own menu
 * put a `true` in one and a `false` in the other.
 */

test('the brief wins when the two disagree, in both directions', () => {
    assert.equal(fileTypeDisabledFor(
        '{"enabledFileTypes": {"alanif": true}}',
        { workspaceValue: { alanif: false } }), false);
    assert.equal(fileTypeDisabledFor(
        '{"enabledFileTypes": {"alanif": false}}',
        { workspaceValue: { alanif: true } }), true);
});

test('settings decide when the brief says nothing about Alan files', () => {
    assert.equal(fileTypeDisabledFor(
        '{"words": []}', { workspaceValue: { alanif: false } }), true);
    assert.equal(fileTypeDisabledFor(
        undefined, { globalValue: { alanif: false } }), true);
    // And the nearest-scope rule still holds underneath.
    assert.equal(fileTypeDisabledFor('{"words": []}', {
        workspaceFolderValue: { '*': true },
        workspaceValue: { alanif: false },
    }), false);
});

test('silence everywhere is still not a fault', () => {
    assert.equal(fileTypeDisabledFor('{"words": []}', {}), false);
    assert.equal(fileTypeDisabledFor(undefined, undefined), false);
});


/**
 * RECOVERING A BRIEF WRITTEN BEFORE THE RENAME.
 *
 * 0.7.12 wrote the concordance as `alan-project-names` / `alan-project-names.txt`;
 * f41e6a6 renamed both a day later. The commit said the old file would be left inert
 * because the brief no longer references it -- which is true only of a brief that has
 * been written since. One that has not still names the old dictionary, so cSpell goes
 * on reading a file nothing updates while we keep the new one current beside it.
 *
 * <p>Found 2026-09-09 in Thomas's own wyldkynd folder: both files on disk, a week
 * apart, the brief pointing at the older. The row said "962 names" the whole time,
 * counting the file cSpell was not reading.
 *
 * <p>So a legacy definition is OURS and gets replaced, exactly like the current one.
 * The author's own dictionaries are not ours and stay.
 */

const LEGACY_BRIEF = JSON.stringify({
    version: '0.2',
    words: ['Aerrowan'],
    language: 'en',
    dictionaryDefinitions: [
        { name: 'alan-project-names', path: './alan-project-names.txt', addWords: false },
        { name: 'their-own', path: './their-own.txt' },
    ],
    languageSettings: [{
        languageId: 'alanif',
        dictionaries: ['alan-project-names', '!java'],
    }],
});

test('a brief from before the rename is migrated, not doubled', () => {
    const merged = parse((briefFor(LEGACY_BRIEF, ['en']) as any).text);
    const names = merged.dictionaryDefinitions.map((d: any) => d.name);

    assert.ok(!names.includes('alan-project-names'), `legacy definition kept: ${names}`);
    assert.ok(names.includes('alan-concordance'), `no current definition: ${names}`);
    assert.ok(names.includes('their-own'), 'the author\'s own dictionary was dropped');
    assert.equal(merged.dictionaryDefinitions.length, 2);
});

test('nothing anywhere in the brief still points at the old file', () => {
    const text = (briefFor(LEGACY_BRIEF, ['en']) as any).text;
    assert.doesNotMatch(text, /alan-project-names/,
        'the old name survives somewhere, so cSpell may still read the stale file');
});

test('the glossary and the author\'s words survive the migration', () => {
    const merged = parse((briefFor(LEGACY_BRIEF, ['en']) as any).text);
    assert.deepEqual(merged.words, ['Aerrowan']);
});


/**
 * A BRIEF THAT NEVER GOT MIGRATED, WHICH NOBODY WOULD EVER LOOK FOR.
 *
 * Running the setup command again now repairs a pre-rename brief, but an author with
 * one has no reason to run it: from where they sit spell checking works, and the row
 * says how many names it holds. It says that by counting the file WE keep current,
 * while cSpell reads the one the brief names, which nothing has written since the
 * rename. Both files sit in the folder, a week apart, and neither of us can see it.
 *
 * <p>THE READING IS DELIBERATELY NARROW: a legacy definition AND no current one. A
 * brief holding both has been written by a version that knows the current name, so its
 * languageSettings point at that, and saying "out of date" would be a false alarm.
 */

const legacy = (name: string) =>
    JSON.stringify({ dictionaryDefinitions: [{ name, path: `./${name}.txt` }] });

test('a brief that names only the old dictionary is out of date', () => {
    assert.equal(wordListIsStale(legacy('alan-project-names')), true);
});

test('anything a current version could have written is not out of date', () => {
    assert.equal(wordListIsStale(legacy('alan-concordance')), false);
    assert.equal(wordListIsStale(JSON.stringify({
        dictionaryDefinitions: [
            { name: 'alan-project-names', path: './alan-project-names.txt' },
            { name: 'alan-concordance', path: './alan-concordance.txt' },
        ],
    })), false);
    assert.equal(wordListIsStale(JSON.stringify({ words: ['Aerrowan'] })), false);
    assert.equal(wordListIsStale('{"dictionaryDefinitions": ['), false);
    assert.equal(wordListIsStale(undefined), false);
});

test('out of date: the count is true and beside the point', () => {
    const r = describeSpellChecking({
        folder: 'wyldkynd', extensionInstalled: true, brief: true, names: 962,
        wordListStale: true,
    });
    assert.equal(r.attention, true);
    assert.equal(r.action, 'setup');
    assert.match(r.text, /wyldkynd/);
    assert.match(r.text, /not being kept current/i);
    assert.doesNotMatch(r.short, /962/);
});

test('a file type switched off outranks an out of date list', () => {
    const r = describeSpellChecking({
        folder: 'wyldkynd', extensionInstalled: true, brief: true, names: 962,
        fileTypeDisabled: true, wordListStale: true,
    });
    assert.equal(r.action, 'enable-file-type');
});

test('and cSpell missing outranks both, since neither would show', () => {
    const r = describeSpellChecking({
        folder: 'wyldkynd', extensionInstalled: false, brief: true, names: 962,
        fileTypeDisabled: true, wordListStale: true,
    });
    assert.equal(r.action, 'install-extension');
});


/**
 * ONE ADD TARGET, WHICH IS THE ONE THE AUTHOR CAN KEEP.
 *
 * cSpell offers "Add to dictionary" three ways: the project's cspell.json, workspace
 * settings, and user settings. Only the first is right here. User settings would make
 * one game's invented vocabulary correct in every other project on the machine, and an
 * author who picked it would never work out why spell checking had gone wrong in their
 * other games. Measured 2026-09-09 against 4.9.1: this works from the brief, but only
 * with EVERY key spelled out -- a partial object removed all five targets, including
 * the two left at their defaults.
 *
 * <p>The concordance stays out of it either way: `addWords: false`, since a word added
 * there dies at the next rebuild.
 */

test('the brief leaves one place for the author to add a word', () => {
    const c = fresh();
    assert.deepEqual(c.allowWordsToBeAddTo, {
        cspell: true,
        dictionaries: true,
        user: false,
        workspace: false,
        folder: false,
    });
});

test('an existing brief gains it too, not only a fresh one', () => {
    const theirs = JSON.stringify({ version: '0.2', words: ['Aerrowan'] });
    const merged = parse((briefFor(theirs, ['en']) as any).text);
    assert.equal(merged.allowWordsToBeAddTo.user, false);
    assert.equal(merged.allowWordsToBeAddTo.cspell, true);
    assert.deepEqual(merged.words, ['Aerrowan']);
});


/**
 * WHAT THE MODAL PROMISES, WHICH IS EVERY FILE THAT WILL BE TOUCHED.
 *
 * The plan ends "Nothing else in this folder is changed", and an author reads that as
 * the whole list. Asking VS Code to store a setting for the folder writes
 * .vscode/settings.json, which is a file in their folder like any other, so it belongs
 * in the list. A promise that is quietly untrue is worse than no promise.
 */

const PLAN = {
    merging: false, gitignore: undefined, words: 962, files: 83, unreadable: [],
};

test('the plan names every file it will write', () => {
    const text = describePlan(['en'], PLAN);
    for (const file of ['cspell.json', 'alan-concordance.txt', '.vscode/settings.json']) {
        assert.ok(text.includes(file), `${file} is written but not promised:\n${text}`);
    }
});

test('the plan says how the list keeps up, since it is not by re-running this', () => {
    // It said "run this command again to rebuild it" for a month after 0.8.0 wired the
    // rebuild to saving. True, and it taught the author the wrong thing.
    const text = describePlan(['en'], PLAN);
    assert.match(text, /whenever you save/);
    assert.doesNotMatch(text, /run this command again/i);
});

test('the plan still closes on the promise it can now keep', () => {
    const text = describePlan(['en'], PLAN);
    assert.match(text, /Nothing else in this folder is changed\.$/);
});

/**
 * ONE SETTING, AND ONLY IN THE FOLDER BEING SET UP. The editor's own settings file
 * belongs to the author, so what we put in it stays countable: an addition here is a
 * deliberate act, not something that accumulated.
 */
test('exactly one editor setting is asked for, and it is the menu entry', () => {
    assert.equal(EDITOR_SETTINGS.length, 1);
    assert.deepEqual(EDITOR_SETTINGS[0], {
        section: 'cSpell',
        key: 'menuItemsOnSpellCheckerActionMenu',
        value: { disableFileType: false },
    });
});
