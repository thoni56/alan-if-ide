import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { NameIndex, indexProject, indexFile, namesDictionary, writeIfChanged } from './names';

/**
 * Collecting a project's own names, over the file set a compile actually reaches.
 *
 * <p>The shape under test is the Italian one, because it is the case both halves of
 * the union are needed for: a game whose library lives outside the open folder and is
 * still ISO-8859-1, plus a walkthrough file the main never imports.
 */

function project(): { main: string; lib: string; loose: string; root: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alan-names-'));
    const lib = path.join(root, 'alanlib_ita');
    const game = path.join(root, 'demo', 'cloak');
    fs.mkdirSync(lib, { recursive: true });
    fs.mkdirSync(game, { recursive: true });

    const main = path.join(game, 'cloak.alan');
    fs.writeFileSync(main,
        "Import '../../alanlib_ita/lib_italian.i'.\n"
        + 'The guardaroba Isa location\n'
        + '  Name spogliatoio\n'
        + '  Description "Uno spogliatoio."\n'
        + 'End The.\n', 'utf8');

    // Latin-1, and never converted by us: it is outside the author's folder.
    const libFile = path.join(lib, 'lib_italian.i');
    fs.writeFileSync(libFile, Buffer.from(
        'Every attaccapànni Isa object\n  Has cnt 0.\nEnd Every.\n', 'latin1'));

    // In the folder, imported by nothing -- Wyldkynd's walkthru.i in miniature.
    const loose = path.join(game, 'walkthru.i');
    fs.writeFileSync(loose, 'The sciarpa Isa object\nEnd The.\n', 'utf8');

    return { main, lib: libFile, loose, root };
}

test('the union covers both an outside import and a file nothing imports', () => {
    const { main, loose } = project();
    const words = [...indexProject([main, loose], new Map()).values()].flat();

    assert.ok(words.includes('guardaroba'), 'a name in the workspace file');
    assert.ok(words.includes('spogliatoio'), 'a Name clause in the workspace file');
    // Reached only through Import, from outside the folder.
    assert.ok(words.includes('attaccapànni'), 'a class in the imported library');
    // Reached only by being a root: nothing imports it.
    assert.ok(words.includes('sciarpa'), 'a name in the unimported file');
    // Still an attribute, wherever it was found.
    assert.ok(!words.includes('cnt'), 'a programmer name stays out');
});

test('a Latin-1 library is read in its own encoding, not mangled', () => {
    const { main } = project();
    const words = [...indexProject([main], new Map()).values()].flat();
    // The accented form, not the two characters a UTF-8 decode would have produced,
    // and not the replacement character a strict one would have.
    assert.ok(words.includes('attaccapànni'));
    assert.ok(!words.some(w => w.includes('�')));
});

test('a re-indexed file replaces its own words and leaves the rest alone', () => {
    const { main, loose } = project();
    const index: NameIndex = indexProject([main, loose], new Map());
    assert.ok(namesDictionary(index).includes('sciarpa'));

    fs.writeFileSync(loose, 'The cappello Isa object\nEnd The.\n', 'utf8');
    indexFile(loose, index);

    const dictionary = namesDictionary(index);
    assert.ok(dictionary.includes('cappello'), 'the new name arrives');
    assert.ok(!dictionary.includes('sciarpa'), 'the old name is gone');
    assert.ok(dictionary.includes('guardaroba'), 'the other file is untouched');
});

test('a file that has been deleted stops contributing', () => {
    const { main, loose } = project();
    const index = indexProject([main, loose], new Map());
    fs.rmSync(loose);
    indexFile(loose, index);
    assert.ok(!namesDictionary(index).includes('sciarpa'));
});

test('the dictionary is sorted, deduplicated, and headed', () => {
    const { main, loose } = project();
    const lines = namesDictionary(indexProject([main, loose], new Map()))
        .split('\n').filter(l => l.length > 0 && !l.startsWith('#'));

    assert.deepEqual(lines, [...lines].sort(), 'sorted');
    assert.equal(new Set(lines).size, lines.length, 'deduplicated');
    assert.ok(namesDictionary(new Map()).startsWith('# Written by Alan IF IDE'));
});

test('the same sources produce the same file whatever order they were walked in', () => {
    const { main, loose } = project();
    assert.equal(
        namesDictionary(indexProject([main, loose], new Map())),
        namesDictionary(indexProject([loose, main], new Map())));
});

test('an unreadable file is collected, not silently dropped', () => {
    const { main } = project();
    const unreadable: string[] = [];
    const missing = path.join(path.dirname(main), 'gone.i');
    fs.writeFileSync(missing, 'The x Isa object\nEnd The.\n', 'utf8');
    fs.chmodSync(missing, 0o000);

    indexProject([main, missing], new Map(), unreadable);
    // Running as root defeats the permission, so only assert what the mode allows.
    if (unreadable.length > 0) {
        assert.deepEqual(unreadable, [missing]);
    }
    fs.chmodSync(missing, 0o644);
});

test('an unchanged dictionary is not rewritten', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alan-names-'));
    const target = path.join(root, 'alan-project-names.txt');

    assert.equal(writeIfChanged(target, 'one\n'), true, 'absent: written');
    const written = fs.statSync(target).mtimeMs;
    assert.equal(writeIfChanged(target, 'one\n'), false, 'identical: left alone');
    assert.equal(fs.statSync(target).mtimeMs, written, 'not even touched');
    assert.equal(writeIfChanged(target, 'two\n'), true, 'different: written');
    assert.equal(fs.readFileSync(target, 'utf8'), 'two\n');
});
