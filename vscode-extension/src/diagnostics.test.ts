import { test } from 'node:test';
import * as assert from 'node:assert';
import { codeOf, isSyntaxDiagnostic } from './diagnostics';

test('a code is read whichever of its three shapes it arrives in', () => {
    // Xtext sends a string; other providers send a number; VS Code's own
    // Diagnostic.code may be {value, target} when the code is a link.
    assert.strictEqual(codeOf({ code: 'org.eclipse.xtext.diagnostics.Diagnostic.Syntax' }),
        'org.eclipse.xtext.diagnostics.Diagnostic.Syntax');
    assert.strictEqual(codeOf({ code: 42 }), '42');
    assert.strictEqual(codeOf({ code: { value: 'Diagnostic.Syntax' } }), 'Diagnostic.Syntax');
});

test('a diagnostic with no code at all is not mistaken for one', () => {
    // The empty string is the safe answer: it matches no issue code, so a
    // diagnostic that carries none can never block formatting.
    assert.strictEqual(codeOf({}), '');
    assert.strictEqual(codeOf({ code: undefined }), '');
    assert.strictEqual(codeOf({ code: null }), '');
    assert.strictEqual(isSyntaxDiagnostic({}), false);
});

test('only a parser diagnostic blocks formatting', () => {
    // The whole point of the check. A file that fails to COMPILE still parses,
    // and formatting it is exactly what its author is likely to want next.
    assert.ok(isSyntaxDiagnostic({ code: 'org.eclipse.xtext.diagnostics.Diagnostic.Syntax' }));
    assert.ok(isSyntaxDiagnostic({ code: { value: 'org.eclipse.xtext.diagnostics.Diagnostic.Syntax' } }));
    assert.strictEqual(isSyntaxDiagnostic({ code: 'alan.compiler.undefined-instance' }), false);
    assert.strictEqual(isSyntaxDiagnostic({ code: 'org.eclipse.xtext.diagnostics.Diagnostic.Linking' }), false);
});
