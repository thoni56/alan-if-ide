/**
 * Reading the diagnostics the language server publishes, without an editor.
 *
 * <p>Extracted from the formatting middleware so the one decision that matters --
 * whether a diagnostic came from the PARSER -- can be asserted in a test. It is the
 * fiddly half: a diagnostic's code arrives in three different shapes.
 */

/** A diagnostic, seen only through the part this module reads. */
export interface Coded {
    code?: string | number | { value: string | number } | null;
}

/** A diagnostic's code as a string (it may be a string, number, or {value, target}). */
export function codeOf(d: Coded): string {
    const c = d.code;
    if (c === undefined || c === null) { return ''; }
    if (typeof c === 'object') { return String(c.value); }
    return String(c);
}

/**
 * True for a diagnostic the PARSER raised, as opposed to the compiler.
 *
 * <p>Only these block formatting: with a partial parse tree the structural formatter
 * could move lines to the wrong place. Semantic and compiler errors parse fine, so
 * those files still format -- which is most of the files an author wants formatted.
 */
export function isSyntaxDiagnostic(d: Coded): boolean {
    return codeOf(d).includes('Diagnostic.Syntax');
}
