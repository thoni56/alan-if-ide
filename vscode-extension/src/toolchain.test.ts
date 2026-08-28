import { test } from 'node:test';
import * as assert from 'node:assert';
import { alarmFor, SetupState } from './toolchain';

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
