import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { legacyOutside, findLegacy } from './encoding';

/**
 * Finding the file that is killing the compile when it is not in the open folder.
 *
 * <p>From the case that prompted it: an Italian Cloak of Darkness whose one source
 * file was converted happily, while the library it imports two directories up stayed
 * ISO-8859-1 and kept the compiler from reading anything at all.
 */

function project(): { main: string; lib: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alan-enc-'));
    const lib = path.join(root, 'alanlib_ita');
    const game = path.join(root, 'demo', 'cloak');
    fs.mkdirSync(lib, { recursive: true });
    fs.mkdirSync(game, { recursive: true });
    const main = path.join(game, 'cloak.alan');
    fs.writeFileSync(main, "Import '../../alanlib_ita/lib_italian.i'.\n", 'utf8');
    const libFile = path.join(lib, 'lib_italian.i');
    fs.writeFileSync(libFile, Buffer.from('Il sacco è pieno.\n', 'latin1'));
    return { main, lib: libFile };
}

test('an imported library outside the folder is found', () => {
    const { main, lib } = project();
    const found = legacyOutside([main]);
    assert.equal(found.length, 1);
    assert.equal(found[0].path, lib);
});

test('a file already inside the workspace is not reported as outside', () => {
    const { main, lib } = project();
    // Handed both, there is nothing outside to warn about -- the normal offer covers it.
    assert.deepEqual(legacyOutside([main, lib]), []);
});

test('a UTF-8 library is not reported at all', () => {
    const { main, lib } = project();
    fs.writeFileSync(lib, Buffer.from('Il sacco è pieno.\n', 'utf8'));
    assert.deepEqual(legacyOutside([main]), []);
});

/**
 * A file we cannot read must not simply vanish from the answer.
 *
 * Dropping it silently shrinks every count and list downstream, so a project that
 * will not compile is told there is nothing to convert -- the exact report that made
 * the feature look broken when the offending file was an outside import. A directory
 * is used to provoke it because reading one fails deterministically on every
 * platform, where permissions do not (CI often runs as a user who can read anything).
 */
test('a source that cannot be read is reported, not silently dropped', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alan-unreadable-'));
    const good = path.join(dir, 'game.alan');
    fs.writeFileSync(good, 'The hall Isa location.\n');
    const notAFile = path.join(dir, 'subdir');
    fs.mkdirSync(notAFile);

    const unreadable: string[] = [];
    const legacy = findLegacy([good, notAFile], unreadable);

    assert.deepEqual(legacy, [], 'a readable ASCII source is already UTF-8');
    assert.deepEqual(unreadable, [notAFile], 'the unreadable path was dropped without a word');
});

test('an import we cannot follow is reported, because the trail stops there', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alan-unreadable-'));
    const main = path.join(dir, 'game.alan');
    fs.mkdirSync(path.join(dir, 'lib.i'));          // a directory wearing a source's name
    fs.writeFileSync(main, "Import 'lib.i'.\nThe hall Isa location.\n");

    const unreadable: string[] = [];
    legacyOutside([main], unreadable);

    // Everything lib.i would itself have imported is now unexamined too, so this is
    // worse than one file of unknown encoding and worth saying out loud.
    assert.deepEqual(unreadable, [path.join(dir, 'lib.i')]);
});
