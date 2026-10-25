import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as path from 'node:path';

import { playExternally, ExternalPlay } from './external';

/**
 * Play in External Interpreter: compile, then hand the game to the system.
 *
 * <p>The system decides which program opens an .a3c (WinArun, Gargoyle...), so the
 * only things the IDE decides are whether there is a game to hand over, and which file
 * it is.
 */

function recorder(compiles: boolean) {
    const calls: string[] = [];
    const io: ExternalPlay = {
        async compile(dir, main) { calls.push(`compile ${main} in ${dir}`); return compiles; },
        async open(file) { calls.push(`open ${file}`); return true; },
        notCompiled(main) { calls.push(`not compiled ${main}`); },
    };
    return { io, calls };
}

const main = path.join('games', 'kitchen', 'game.alan');
const dir = path.dirname(main);

test('a game that compiles is handed to the system to open', async () => {
    const { io, calls } = recorder(true);
    await playExternally(main, io);
    assert.deepEqual(calls, [
        `compile game.alan in ${dir}`,
        `open ${path.join(dir, 'game.a3c')}`,
    ]);
});

test('a game that does not compile is not opened, and the author is told', async () => {
    const { io, calls } = recorder(false);
    await playExternally(main, io);
    assert.deepEqual(calls, [
        `compile game.alan in ${dir}`,
        'not compiled game.alan',
    ]);
});
