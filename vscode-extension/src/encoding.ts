import * as fs from 'fs';

/**
 * Deciding what encoding an Alan source is in, and moving it to UTF-8.
 *
 * Alan's compiler is told the encoding with `-encoding <iso|utf8>` and the file
 * cannot say which it is, so a mismatch fails in two directions: a Latin-1 source
 * read as UTF-8 aborts with an unlocatable system error, and a UTF-8 source read as
 * Latin-1 builds cleanly and ships corrupted prose. (Upstream: alan-if/alan#54, #56.)
 *
 * Rather than guess per compile, the IDE settles it: everything becomes UTF-8, and
 * the compiler is always told `utf8`. That is the only fix that also repairs what the
 * AUTHOR SEES -- passing `iso` would satisfy the compiler while leaving replacement
 * characters in the editor, one save away from real data loss.
 *
 * Conversion is safe to insist on: every Latin-1 byte has a UTF-8 form, so it cannot
 * fail or lose anything, and it is reversible with
 * `iconv -f UTF-8 -t ISO-8859-1`. It is also game-preserving -- a converted source
 * compiled with `-encoding utf8` produces a byte-identical transcript.
 */

/** A source file that is not valid UTF-8, and therefore presumed ISO-8859-1. */
export interface Legacy {
    path: string;
    /** Count of bytes >= 0x80, purely to describe the scale of the change. */
    highBytes: number;
}

/**
 * True when the bytes decode as UTF-8.
 *
 * Pure ASCII decodes trivially and needs no conversion -- it is already valid UTF-8,
 * which is why a typical English adventure is untouched by any of this.
 */
export function isUtf8(bytes: Buffer): boolean {
    try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        return true;
    } catch {
        return false;
    }
}

/** Files among these that are not UTF-8. Unreadable files are skipped, not guessed at. */
export function findLegacy(paths: string[]): Legacy[] {
    const legacy: Legacy[] = [];
    for (const path of paths) {
        let bytes: Buffer;
        try {
            bytes = fs.readFileSync(path);
        } catch {
            continue;
        }
        if (!isUtf8(bytes)) {
            legacy.push({ path, highBytes: bytes.filter(b => b >= 0x80).length });
        }
    }
    return legacy;
}

/**
 * Rewrite a file from ISO-8859-1 to UTF-8, byte-wise.
 *
 * Deliberately not a text round-trip through any line-ending-aware API: these are
 * often Windows sources, and CR and LF are ASCII, so decoding latin1 and encoding
 * utf8 passes them through untouched. No BOM is added -- the compiler tolerates one,
 * but it would change bytes for no benefit.
 */
export function convertToUtf8(path: string): void {
    const bytes = fs.readFileSync(path);
    const text = bytes.toString('latin1');   // bijective: every byte maps to one char
    fs.writeFileSync(path, Buffer.from(text, 'utf8'));
}
