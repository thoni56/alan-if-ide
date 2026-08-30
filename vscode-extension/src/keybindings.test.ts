import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { hasRewrapBinding, withRewrapBinding } from './keybindings';

/**
 * keybindings.json is hand-maintained, comment-carrying, and often a little broken.
 * Appending to a file we have misread would cost the author every binding they have,
 * so every shape below either produces a correct file or produces nothing.
 */

const DEFAULT_FILE = '// Place your key bindings in this file to override the defaults\n[\n]';

/** Parse the result the way VS Code will, comments stripped. */
function entries(text: string): { key?: string; command?: string; when?: string }[] {
    return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
}

test('an untouched keybindings.json gains the binding and stays valid JSON', () => {
    const updated = withRewrapBinding(DEFAULT_FILE);
    assert.ok(updated);
    assert.deepEqual(entries(updated), [{
        key: 'alt+q',
        command: 'alanif.rewrapString',
        when: 'editorTextFocus && editorLangId == alanif',
    }]);
});

test('an existing binding is kept, and ours is separated from it', () => {
    const file = '[\n    {\n        "key": "ctrl+shift+t",\n        "command": "testing.runAll"\n    }\n]';
    const updated = withRewrapBinding(file);
    assert.ok(updated);
    const all = entries(updated);
    assert.equal(all.length, 2);
    assert.equal(all[0].command, 'testing.runAll');
    assert.equal(all[1].command, 'alanif.rewrapString');
});

test('a trailing comma is not doubled', () => {
    const file = '[\n    { "key": "ctrl+k", "command": "a" },\n]';
    const updated = withRewrapBinding(file);
    assert.ok(updated);
    assert.equal(entries(updated).length, 2);
});

test('a bracket inside a when clause is not the end of the file', () => {
    // The scan has to know it is in a string, or it would append after this one.
    const file = '[\n    { "key": "ctrl+k", "command": "a", "when": "x == y[0]" }\n]';
    const updated = withRewrapBinding(file);
    assert.ok(updated);
    const all = entries(updated);
    assert.equal(all.length, 2);
    assert.equal(all[0].when, 'x == y[0]');
});

test('comments survive, wherever the author put them', () => {
    const file = '// mine\n[\n    // the test runner\n    { "key": "ctrl+k", "command": "a" }\n    /* and that is all */\n]';
    const updated = withRewrapBinding(file);
    assert.ok(updated);
    assert.match(updated, /\/\/ the test runner/);
    assert.match(updated, /and that is all/);
    assert.equal(entries(updated.replace(/\/\*[\s\S]*?\*\//g, '')).length, 2);
});

test('a file we do not understand is left entirely alone', () => {
    // Undefined is a real answer: appending to a file we have misread would cost
    // the author every binding in it.
    assert.equal(withRewrapBinding('{ "not": "an array" }'), undefined);
    assert.equal(withRewrapBinding('[\n    { "key": "ctrl+k" }\n'), undefined);   // never closed
    assert.equal(withRewrapBinding(''), undefined);
});

test('a binding that is already there is recognised, however it was written', () => {
    assert.ok(hasRewrapBinding('[{ "command": "alanif.rewrapString", "key": "alt+w" }]'));
    assert.ok(hasRewrapBinding('[{"command"  :  "alanif.rewrapString"}]'));
    assert.equal(hasRewrapBinding(DEFAULT_FILE), false);
});
