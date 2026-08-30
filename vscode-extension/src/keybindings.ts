/**
 * Adding one entry to the user's keybindings.json, as text.
 *
 * <p>There is no API for this: VS Code can OPEN the file and it can open the
 * Keyboard Shortcuts UI, but nothing writes a binding for you. So the file has to be
 * edited as what it is -- JSON with comments, hand-maintained, and frequently a bit
 * broken. Ours is one entry appended to a top-level array, which is a small enough
 * job to do safely if the scan is honest about strings and comments: a `]` inside a
 * `when` clause must not look like the end of the file.
 *
 * <p>Kept free of the editor so every shape of that file can be tested as text.
 */

/** What we add. The `when` is what keeps Rewrap in charge of every other language. */
export const REWRAP_BINDING = `{
        "key": "alt+q",
        "command": "alanif.rewrapString",
        "when": "editorTextFocus && editorLangId == alanif"
    }`;

/** True when Alt+Q already runs Re-wrap String, however the author spelled it. */
export function hasRewrapBinding(text: string): boolean {
    return /"command"\s*:\s*"alanif\.rewrapString"/.test(text);
}

/**
 * The file with our binding added, or undefined if we will not touch it.
 *
 * <p>Undefined is a real answer, not a failure to try: a keybindings.json that is not
 * a top-level array is one we do not understand, and appending to a file we have
 * misread would cost the author every binding they have.
 */
export function withRewrapBinding(text: string): string | undefined {
    const shape = topLevelArray(text);
    if (!shape) {
        return undefined;
    }
    const { close, lastCode } = shape;
    const previous = lastCode === undefined ? '[' : text[lastCode];
    const separator = previous === '[' || previous === ',' ? '' : ',';
    const at = lastCode === undefined ? close : lastCode + 1;
    return text.slice(0, at) + separator + '\n    ' + REWRAP_BINDING + '\n' + text.slice(at);
}

/**
 * Where the top-level array ends, and the last character of real content in it.
 *
 * <p>"Real content" skips whitespace, comments and the insides of strings, so the
 * caller can tell an empty array from a full one, and a trailing comma from a
 * missing one, without parsing the entries themselves.
 */
function topLevelArray(text: string): { close: number; lastCode?: number } | undefined {
    let depth = 0;
    let opened = false;
    let lastCode: number | undefined;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '/' && text[i + 1] === '/') {
            const nl = text.indexOf('\n', i);
            i = nl === -1 ? text.length : nl;
            continue;
        }
        if (c === '/' && text[i + 1] === '*') {
            const end = text.indexOf('*/', i + 2);
            i = end === -1 ? text.length : end + 1;
            continue;
        }
        if (c === '"') {
            i = endOfString(text, i);
            if (depth === 1) { lastCode = i; }
            continue;
        }
        if (/\s/.test(c)) {
            continue;
        }
        if (!opened) {
            if (c !== '[') {
                return undefined;      // not an array of bindings; not ours to edit
            }
            opened = true;
            depth = 1;
            continue;
        }
        if (c === '[' || c === '{') { depth++; }
        if (c === ']' || c === '}') {
            depth--;
            if (depth === 0) {
                return c === ']' ? { close: i, lastCode } : undefined;
            }
        }
        if (depth >= 1) { lastCode = i; }
    }
    return undefined;                  // never closed: a file mid-edit, left alone
}

/** The index of the closing quote of the string starting at `open`. */
function endOfString(text: string, open: number): number {
    for (let i = open + 1; i < text.length; i++) {
        if (text[i] === '\\') { i++; continue; }
        if (text[i] === '"') { return i; }
    }
    return text.length;
}
