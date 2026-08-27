import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { serverEnvironment } from './serverConfig';

/**
 * That the server is actually TOLD where the compiler is.
 *
 * <p>This is the assertion whose absence let 0.7.1 and 0.7.2 ship with diagnostics
 * that never ran. Removing these variables broke nothing visible on a machine with
 * `alan` on PATH, because the server's own fallback lands on the same command -- so
 * the bug could only appear on a machine none of us develops on.
 */

test('the resolved compiler is passed to the server', () => {
    const env = serverEnvironment({ PATH: '/usr/bin' },
        { ok: true, command: 'c:\\Alan\\bin\\alan.exe', version: '3.0beta8', source: 'PATH' },
        'upper');
    assert.equal(env.ALAN_COMPILER, 'c:\\Alan\\bin\\alan.exe');
    assert.equal(env.ALANIF_KEYWORD_CASE, 'upper');
    assert.equal(env.PATH, '/usr/bin', 'the rest of the environment is preserved');
});

test('no compiler means no variable, rather than an empty one', () => {
    // An empty ALAN_COMPILER would be read as a configured-but-blank path; absence
    // lets the server fall through to its own search, which is the intended behaviour.
    const env = serverEnvironment({}, { ok: false, tried: ['alan'] }, undefined);
    assert.equal('ALAN_COMPILER' in env, false);
    assert.equal(env.ALANIF_KEYWORD_CASE, 'off');
});
