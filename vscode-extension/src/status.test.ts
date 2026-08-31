import { test } from 'node:test';
import * as assert from 'node:assert';
import * as Module from 'node:module';

/**
 * The WIRING, which the describers' own tests cannot reach.
 *
 * status.ts is the one module here that must import the editor, so it had no tests
 * at all -- and it is where the alarm once stayed armed while hidden. A stub of the
 * handful of API calls it makes is enough to drive it: the same technique that
 * verified the packaged extension tree loads.
 */
interface FakeItem {
    id?: string; name?: string; text: string; detail?: string;
    severity?: number; command?: unknown; tooltip?: unknown;
    backgroundColor?: unknown; visible: boolean;
    show(): void; hide(): void; dispose(): void;
}

const items: FakeItem[] = [];
let bar: FakeItem | undefined;
let onEditorChanged: (() => void) | undefined;
let alanInFront = true;

function fakeItem(id?: string): FakeItem {
    const item: FakeItem = {
        id, text: '', visible: false,
        show() { this.visible = true; },
        hide() { this.visible = false; },
        dispose() { /* nothing to release */ },
    };
    return item;
}

const vscode = {
    LanguageStatusSeverity: { Information: 0, Warning: 1, Error: 2 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ThemeColor: class { constructor(public id: string) { } },
    languages: {
        createLanguageStatusItem(id: string) {
            const item = fakeItem(id);
            items.push(item);
            return item;
        },
    },
    window: {
        get activeTextEditor() {
            return alanInFront ? { document: { languageId: 'alanif' } } : undefined;
        },
        createStatusBarItem() { bar = fakeItem('bar'); return bar; },
        onDidChangeActiveTextEditor(handler: () => void) {
            onEditorChanged = handler;
            return { dispose() { /* nothing to release */ } };
        },
    },
    commands: { executeCommand() { /* context keys are not under test */ } },
    workspace: {
        getConfiguration: () => ({ get: () => undefined }),
        onDidChangeConfiguration: () => ({ dispose() { /* nothing */ } }),
    },
    extensions: { getExtension: () => undefined },
    EventEmitter: class {
        event = () => ({ dispose() { /* nothing */ } });
        fire() { /* nothing listens in these tests */ }
    },
};

/**
 * environment.ts resolves by SPAWNING the real tools, which would make this a test of
 * whatever happens to be installed. Stubbing the module instead keeps the production
 * code free of a seam that exists only for tests, and re-rendering here goes through
 * the same listener the extension uses.
 */
let current: unknown;
let onEnvironmentChanged: ((env: unknown) => void) | undefined;
const environment = {
    getEnvironment: () => current,
    onEnvironmentChanged(handler: (env: unknown) => void) {
        onEnvironmentChanged = handler;
        return { dispose() { /* nothing to release */ } };
    },
};

const load = (Module as any)._load;
(Module as any)._load = function (request: string, ...rest: unknown[]) {
    if (request === 'vscode') { return vscode; }
    if (request.endsWith('/environment') || request === './environment') { return environment; }
    return load.call(this, request, ...rest);
};

// After the stubs are in place, never before.
const status = require('./status');

const context = { subscriptions: [] as { dispose(): void }[] };

function build(env: unknown) {
    items.length = 0;
    bar = undefined;
    current = env;
    status.createStatusItems(context);
}

/** What the extension does when the toolchain is re-probed. */
function reresolve(env: unknown) {
    current = env;
    onEnvironmentChanged?.(env);
}

const HEALTHY = {
    java: { ok: true, command: '/j/java', version: 21, source: 'the bundled runtime' },
    compiler: { ok: true, command: '/b/alan', version: '3.0beta8', source: 'PATH' },
    arun: { ok: true, command: '/b/arun', version: '3.0beta8', source: 'next to the compiler' },
};

test('every status item is filled in, and the alarm stays away', () => {
    build(HEALTHY);
    const texts = items.map(i => i.text);
    assert.ok(texts.some(t => t.startsWith('Java 21')), `java missing from ${texts}`);
    assert.ok(texts.some(t => t.startsWith('Compiler 3.0beta8')), `compiler missing from ${texts}`);
    assert.ok(texts.some(t => t.startsWith('Interpreter 3.0beta8')), `arun missing from ${texts}`);
    assert.strictEqual(bar?.visible, false);
    assert.strictEqual(bar?.text, '');
});

test('a missing compiler raises the alarm, and it is shown', () => {
    build({ ...HEALTHY, compiler: { ok: false, tried: [] } });
    assert.match(bar!.text, /Alan setup/);
    assert.strictEqual(bar!.visible, true);
});

test('an alarm that is answered leaves nothing armed behind it', () => {
    // THE REGRESSION THIS FILE EXISTS FOR. hide() does not clear an item's text, and
    // the active-editor subscription re-shows anything WITH text -- so an alarm that
    // had ever fired used to come back on the next tab switch, still naming a
    // compiler that had since been found.
    build({ ...HEALTHY, compiler: { ok: false, tried: [] } });
    assert.strictEqual(bar!.visible, true);

    reresolve(HEALTHY);                      // the author installs the compiler

    assert.strictEqual(bar!.text, '', 'the alarm kept its text after the fault was fixed');
    assert.strictEqual(bar!.visible, false);

    onEditorChanged?.();                     // the tab switch that used to resurrect it
    assert.strictEqual(bar!.visible, false, 'a healthy alarm came back on a tab switch');
});

test('the alarm follows the active editor while it is armed', () => {
    build({ ...HEALTHY, compiler: { ok: false, tried: [] } });
    alanInFront = false;
    onEditorChanged?.();
    assert.strictEqual(bar!.visible, false);
    alanInFront = true;
    onEditorChanged?.();
    assert.strictEqual(bar!.visible, true);
});
