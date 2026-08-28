import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { missingJavaMessage } from './java';

/**
 * What an author is told when the language server cannot start.
 *
 * This is the one message that has to be right first time: without Java there is no
 * server, so every other surface the extension has is silent. Sending someone to
 * install a runtime they already have — bundled, inside the extension, merely not
 * executable — costs them the evening and does not fix it.
 */

test('a runtime that is present but will not run is not reported as missing', () => {
    const message = missingJavaMessage({
        ok: false,
        tooOld: [],
        bundled: true,
        blocked: '/ext/jre/bin/java is present but could not be made executable (EPERM)',
    });

    assert.match(message, /present but could not be made executable/);
    assert.match(message, /executable bit/, 'did not name the likely cause');
    // The remedy for a blocked runtime is not the remedy for an absent one.
    assert.doesNotMatch(message, /Reinstalling it will fetch/);
});

test('the platform-neutral build is told to reinstall, not to go hunting for a JDK', () => {
    const message = missingJavaMessage({ ok: false, tooOld: [], bundled: false });

    assert.match(message, /platform-neutral build/);
    assert.match(message, /Reinstalling it will fetch/);
});

test('a bundled runtime that is simply too old asks for a newer one', () => {
    const message = missingJavaMessage({
        ok: false,
        tooOld: [{ command: '/ext/jre/bin/java', version: 17, source: 'the bundled runtime' }],
        bundled: true,
    });

    assert.match(message, /provides Java 17/);
    assert.match(message, /alanif\.java\.home/);
});
