import { test } from 'node:test';
import * as assert from 'node:assert';
import { alarmFor, describeTool, overriddenPathWarnings, SetupState, probeTool, glkHint, missingArunMessage } from './toolchain';
import { describeJava } from './java';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** A setup with nothing wrong; each test spoils exactly the part it is about. */
function healthy(): SetupState {
    return { java: { ok: true }, compiler: { ok: true }, arun: { ok: true } };
}

test('a healthy setup raises no alarm at all', () => {
    // The regression this file exists for. The alarm used to be hidden but left
    // armed, so it came back on the next tab switch still naming a compiler that
    // had since been found -- reported from a Mac, where a tool had been missing
    // and was then fixed, which is a history a developer machine never has.
    // Absence has to be a VALUE the caller applies, not a branch it remembers.
    assert.strictEqual(alarmFor(healthy()), undefined);
});

test('a missing compiler is named, and is not severe', () => {
    const setup = healthy();
    setup.compiler = { ok: false };
    const alarm = alarmFor(setup);
    assert.ok(alarm);
    assert.match(alarm.tooltip, /cannot find the Alan compiler/);
    // The editor still works without a compiler; only Java is fatal.
    assert.strictEqual(alarm.severe, false);
});

test('missing Java is severe, because then there is no server at all', () => {
    const setup = healthy();
    setup.java = { ok: false };
    assert.strictEqual(alarmFor(setup)?.severe, true);
});

test('a setting that was set and stepped over is still a failure', () => {
    const setup = healthy();
    setup.compiler = { ok: true, warning: 'does not run as the Alan compiler' };
    const alarm = alarmFor(setup);
    assert.ok(alarm);
    assert.match(alarm.tooltip, /ignoring alanif\.compiler\.path/);
});

test('a server that did not restart raises the alarm on its own', () => {
    // Nothing is missing and no setting is ignored: probing the machine cannot see
    // this fault, because the tools are all there and only the running server was
    // never told. It has to be reportable in, or it stays as silent as it was when
    // it cost a Mac author a session of empty Problems panel.
    const alarm = alarmFor(healthy(), 'The language server did not restart.');
    assert.ok(alarm);
    assert.match(alarm.tooltip, /did not restart/);
});

test('everything wrong at once is listed as prose, not a data structure', () => {
    const alarm = alarmFor({ java: { ok: false }, compiler: { ok: false }, arun: { ok: false } });
    assert.ok(alarm);
    assert.match(alarm.tooltip, /Java, the Alan compiler and arun/);
});

/**
 * Telling apart the five ways a chosen program can fail to be an Alan tool.
 *
 * All five used to arrive at the author as one sentence -- "that does not run as an
 * Alan interpreter" -- in the very first dialog a new user meets. Robert, the only
 * other person using this, hit one of them on Windows and there was nothing in the
 * message for either of us to work with. Each case here is a stand-in for a real
 * program, because what matters is what we say, not how we detected it.
 */
function tool(body: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alan-probe-'));
    const file = path.join(dir, 'faketool');
    fs.writeFileSync(file, `#!/bin/sh\n${body}\n`);
    fs.chmodSync(file, 0o755);
    return file;
}

test('a real Alan tool reports its version', () => {
    const probe = probeTool(tool('echo 3.0beta8'));
    assert.equal(probe.version, '3.0beta8');
    assert.equal(probe.failure, undefined);
});

test('a program that exits cleanly and says nothing is called silent, not missing', () => {
    // The WinArun shape: InitGlk fails, it exits 0 before reading any argument, and
    // from the outside it looks exactly like a healthy program with nothing to say.
    const probe = probeTool(tool('exit 0'));
    assert.equal(probe.failure, 'silent');
    assert.match(probe.reason!, /printed nothing/);
});

test('and only that case earns the Glk hint', () => {
    assert.match(glkHint('silent'), /Glk DLL/);
    assert.equal(glkHint('unrecognised'), '');
    assert.equal(glkHint(undefined), '');
});

test('a program that fails is quoted, so the author sees what it actually said', () => {
    const probe = probeTool(tool('echo "cannot open display" >&2; exit 3'));
    assert.equal(probe.failure, 'failed');
    assert.match(probe.reason!, /status 3/);
    assert.match(probe.reason!, /cannot open display/);
});

test('some other program is not mistaken for Alan', () => {
    const probe = probeTool(tool('echo "GNU bash, version 5.2"'));
    assert.equal(probe.failure, 'unrecognised');
    assert.match(probe.reason!, /not an Alan version/);
});

test('a path with nothing at it says so plainly', () => {
    const probe = probeTool(path.join(os.tmpdir(), 'no-such-alan-tool-here'));
    assert.equal(probe.failure, 'missing');
});

test('a program that never answers is a timeout, not a refusal', () => {
    const probe = probeTool(tool('sleep 5'), 200);
    assert.equal(probe.failure, 'timeout');
    assert.match(probe.reason!, /did not answer/);
});

test('the missing-interpreter message carries the reason and the hint', () => {
    const message = missingArunMessage({
        ok: false,
        tried: ['C:\\Alan\\WinArun.exe'],
        ignoredSetting: 'C:\\Alan\\WinArun.exe',
        settingFailure: 'silent',
        settingReason: 'it ran and exited normally but printed nothing, so it cannot say what it is',
    });
    assert.match(message, /printed nothing/);
    assert.match(message, /Glk DLL/);
});

test('a setting that was stepped over is reported, once per tool', () => {
    // The failure this exists for is silent BY CONSTRUCTION: the tool was found,
    // so every other surface says "ok" and nothing mentions that the path the
    // author chose is not the one running.
    const setup: SetupState = {
        java: { ok: true, warning: 'alanif.java.home does not run; using the bundled runtime' },
        compiler: { ok: true },
        arun: { ok: true, warning: 'alanif.arun.path does not run; using the one beside the compiler' },
    };
    assert.deepStrictEqual(overriddenPathWarnings(setup), [
        'alanif.java.home does not run; using the bundled runtime',
        'alanif.arun.path does not run; using the one beside the compiler',
    ]);
});

test('a healthy setup, and a missing tool, have nothing to say about settings', () => {
    // A MISSING tool is reported elsewhere, loudly. Repeating it here as an
    // ignored-setting warning would be a second notification saying less.
    assert.deepStrictEqual(overriddenPathWarnings(healthy()), []);
    assert.deepStrictEqual(overriddenPathWarnings({
        java: { ok: true },
        compiler: { ok: false, warning: 'never read when the tool is missing' },
        arun: { ok: true },
    }), []);
});

/**
 * The status lines themselves. Until describeTool existed these decisions lived in a
 * closure over five LanguageStatusItems, so the only way to check what an author
 * would read was to run VS Code and look.
 */
const COMPILER = {
    noun: 'Compiler',
    setting: 'alanif.compiler.path',
    lost: 'No diagnostics, no Play',
    locate: 'alanif.locateCompiler',
};

test('a found tool says its version and where it came from', () => {
    const d = describeTool(
        { ok: true, command: '/usr/local/bin/alan', version: '3.0beta8', source: 'PATH' },
        COMPILER);
    assert.strictEqual(d.text, 'Compiler 3.0beta8');
    assert.match(d.detail, /alan — PATH$/);
    assert.strictEqual(d.severity, 'info');
});

test('a tool found past an ignored setting says so, and warns', () => {
    // The silent-fallthrough case: the tool WORKS, so nothing else would ever
    // mention that the path the author set was stepped over.
    const d = describeTool(
        { ok: true, command: '/usr/bin/alan', version: '3.0beta8', source: 'PATH', warning: 'x' },
        COMPILER);
    assert.match(d.detail, /^alanif\.compiler\.path ignored — using /);
    assert.strictEqual(d.severity, 'warning');
});

test('a missing tool says what stops working, and offers to find it', () => {
    const d = describeTool({ ok: false, tried: [] }, COMPILER);
    assert.strictEqual(d.text, 'Compiler not found');
    assert.strictEqual(d.detail, 'No diagnostics, no Play');
    assert.strictEqual(d.command.command, 'alanif.locateCompiler');
});

test('missing Java is an error where a missing compiler is only a warning', () => {
    // Not a style choice: without Java there is no language server at all, so
    // nothing else in the list can even be true.
    assert.strictEqual(describeJava({ ok: false, tooOld: [], bundled: true }).severity, 'error');
    assert.strictEqual(describeTool({ ok: false, tried: [] }, COMPILER).severity, 'warning');
});

test('a Java that is present but too old says which version it found', () => {
    const d = describeJava({
        ok: false, bundled: true,
        tooOld: [{ command: '/usr/bin/java', version: 17, source: 'PATH' }],
    });
    assert.strictEqual(d.text, 'Java 17 — too old');
});

test('a build with no runtime of its own says so, rather than just naming a version', () => {
    // Otherwise "needs Java 21" contradicts a settings page promising a bundled one.
    const d = describeJava({ ok: false, tooOld: [], bundled: false });
    assert.match(d.detail, /platform-neutral build bundles none/);
});
