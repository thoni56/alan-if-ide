import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { serverEnvironment, compilerToldTo, serverNeedsRestart } from './serverConfig';
import { ToolResult } from './toolchain';

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

/**
 * That a server holding the wrong compiler is noticed.
 *
 * <p>The bug these are written against: the compiler path is resolved once, at
 * activation, and the only thing that ever re-told the server was an edit to
 * alanif.compiler.path. Every other way a path stops working -- the SDK moved, the
 * SDK installed after the window opened, the same global setting read from the other
 * side of a remote/local switch -- leaves the setting untouched, so nothing fired and
 * the server went on failing to run a path it could not see, with an empty Problems
 * panel and every setup surface reporting success.
 */

const found = (command: string): ToolResult =>
    ({ ok: true, command, version: '3.0beta8', source: 'PATH' });
const missing: ToolResult = { ok: false, tried: ['alan'] };

test('the same compiler needs no restart', () => {
    assert.equal(serverNeedsRestart('/usr/local/bin/alan', found('/usr/local/bin/alan')), false);
});

test('a compiler that moved needs a restart', () => {
    // The remote/local switch: one global setting, two machines, one of the paths
    // is not a file over there.
    assert.equal(serverNeedsRestart('C:\\Alan\\bin\\alan.exe', found('/usr/local/bin/alan')), true);
});

test('a compiler that has gone missing needs a restart', () => {
    // Otherwise the server keeps the dead path: the environment it was launched with
    // still names it, and an omitted initializationOption does not unsay it.
    assert.equal(serverNeedsRestart('/usr/local/bin/alan', missing), true);
});

test('a compiler that has appeared needs a restart', () => {
    assert.equal(serverNeedsRestart(undefined, found('/usr/local/bin/alan')), true);
});

test('still no compiler needs no restart', () => {
    assert.equal(serverNeedsRestart(undefined, missing), false);
});

test('what the server is told is the resolved command, or nothing', () => {
    assert.equal(compilerToldTo(found('/usr/local/bin/alan')), '/usr/local/bin/alan');
    assert.equal(compilerToldTo(missing), undefined);
});
