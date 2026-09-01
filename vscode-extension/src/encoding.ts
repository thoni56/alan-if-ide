import * as path from 'path';
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

/**
 * Files among these that are not UTF-8.
 *
 * A file we cannot read is skipped rather than guessed at -- but it is COLLECTED into
 * `unreadable`, never simply dropped. Silently shrinking the list is how a scan
 * reports "nothing to convert" for a project that will not compile, which is exactly
 * the outcome that makes this feature look broken to the one author it failed.
 */
export function findLegacy(paths: string[], unreadable: string[] = []): Legacy[] {
    const legacy: Legacy[] = [];
    for (const path of paths) {
        let bytes: Buffer;
        try {
            bytes = fs.readFileSync(path);
        } catch {
            unreadable.push(path);
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

/**
 * The text of a source, whichever of the two encodings it is in.
 *
 * <p>The IDE's position is that everything becomes UTF-8, but a file it will not
 * convert must still be READ correctly meanwhile: the imported library outside the
 * folder is exactly where the unusual words are, and it is exactly the file that
 * stays ISO-8859-1. Decoding it as UTF-8 would fail and yield replacement characters
 * where the accented names are, which is worse than not reading it at all.
 */
export function sourceText(bytes: Buffer): string {
    return isUtf8(bytes) ? bytes.toString('utf8') : bytes.toString('latin1');
}

/**
 * Hand every file a compile reaches through `Import` to `visit`, once each.
 *
 * <p>A project is its main plus everything Import pulls in, and that routinely leaves
 * the folder the author has open: an Italian Cloak of Darkness is one file importing
 * a library two directories up. Both the things we do to a whole project -- checking
 * its encoding and collecting its names -- need that same trail, so the walk is here
 * once rather than written twice, differently.
 *
 * <p>The roots are visited too, so passing the workspace's own sources yields the
 * UNION of what is open and what is imported. Neither half is sufficient alone: the
 * trail alone misses a file the main never imports (Wyldkynd's walkthru.i, which
 * holds 14 of that game's typos), and the workspace alone misses the outside library.
 *
 * <p>The 500-file ceiling is a guard against a pathological trail, not a real limit --
 * Wyldkynd, the largest Alan game we know of, is 83 files.
 */
export function followImports(
    roots: string[],
    visit: (file: string, bytes: Buffer) => void,
    unreadable: string[] = [],
): void {
    const seen = new Set<string>();

    const follow = (file: string) => {
        const here = path.resolve(file);
        if (seen.size > 500 || seen.has(here) || !fs.existsSync(here)) {
            return;
        }
        seen.add(here);
        let bytes: Buffer;
        try {
            bytes = fs.readFileSync(here);
        } catch {
            // Reached through Import, so this one is worse than a file we merely
            // cannot classify: the trail stops here, and everything it would have
            // imported goes unexamined too.
            unreadable.push(here);
            return;
        }
        visit(here, bytes);
        // Read as latin1 so a file in ANY single-byte encoding still yields readable
        // ASCII import lines -- decoding as UTF-8 would fail on the very files we want.
        const text = bytes.toString('latin1');
        const imports = /^[^'"\n]*?\bimport\s+(['"])(.+?)\1/gim;
        let m: RegExpExecArray | null;
        while ((m = imports.exec(text)) !== null) {
            follow(path.resolve(path.dirname(here), m[2]));
        }
    };

    roots.forEach(follow);
}

/**
 * Files a compile reaches through `Import` that lie outside the given set.
 *
 * <p>We follow the same trail the compiler does so we can SAY which outside files are
 * still in the old encoding -- but not convert them. They are typically a shared
 * library inside someone else's checkout, used by every other game on the disk, and
 * rewriting ten files because one demo was opened is not a decision this dialog is
 * entitled to make.
 */
export function legacyOutside(workspaceFiles: string[], unreadable: string[] = []): Legacy[] {
    const inside = new Set(workspaceFiles.map(f => path.resolve(f)));
    const found: Legacy[] = [];
    followImports(workspaceFiles, (file, bytes) => {
        if (!inside.has(file) && !isUtf8(bytes)) {
            found.push({ path: file, highBytes: bytes.filter(b => b >= 0x80).length });
        }
    }, unreadable);
    return found;
}
