import * as fs from 'fs';
import * as path from 'path';
import { followImports, sourceText } from './encoding';
import { projectWords, dictionaryFile } from './spelling';

/**
 * The generated word list: every player-facing name the project declares.
 *
 * <p>This is the half of spell checking that decides whether an author keeps it
 * switched on. Wyldkynd's prose is ordinary English -- only 101 distinct words in it
 * are unknown to a dictionary at all -- and nearly every one of those is a name the
 * author invented. Feeding the game's own declarations back in takes cSpell from 178
 * unknown words to 57, and what survives is almost entirely real: typos in shipped
 * prose, and misspellings of the game's own characters. Holding the CORRECT spelling
 * of Aerrowan is precisely what makes `Arrowan` stand out.
 *
 * <p>The list is DERIVED, so it is machine-owned: generated, gitignored, and always
 * correct to rebuild. The author's own exceptions live in cspell.json instead, where
 * cSpell's "Add to dictionary" puts them, so that regenerating this file can never
 * silently discard a decision the author made.
 *
 * <p>THE INDEX IS PER FILE, not one flat set, because that is what makes the cheap
 * update possible: on save, one file's words are replaced wholesale and the dictionary
 * is rewritten only if the sorted list actually changed. Prose edits vastly outnumber
 * name changes, and cSpell re-checks every open document whenever a dictionary file
 * changes, so writing an identical file on every save would re-check the world for
 * nothing.
 */

/** Each source file, by resolved path, and the words it contributes. */
export type NameIndex = Map<string, string[]>;

/**
 * Rebuild the whole index from the project.
 *
 * <p>Pass the workspace's own sources as `roots`: they are visited too, so the walk
 * yields the union of what the author has open and what the compile imports from
 * outside the folder. This is also the repair for anything that has drifted -- a
 * pull, a rename, an edit made in another editor -- which is why it clears first
 * rather than merging into what is already there.
 */
export function indexProject(
    roots: string[],
    index: NameIndex,
    unreadable: string[] = [],
): NameIndex {
    index.clear();
    followImports(roots, (file, bytes) => {
        index.set(file, projectWords(sourceText(bytes)));
    }, unreadable);
    return index;
}

/**
 * Replace one file's contribution, for the save that just happened.
 *
 * <p>A file we can no longer read drops out entirely rather than keeping its old
 * words: that is what makes a deleted file's names disappear, and a name that has
 * been renamed away stop vouching for itself. Nothing is reported, because this runs
 * on every save -- the file the author just deleted is not a problem to announce.
 */
export function indexFile(file: string, index: NameIndex): NameIndex {
    const here = path.resolve(file);
    try {
        index.set(here, projectWords(sourceText(fs.readFileSync(here))));
    } catch {
        index.delete(here);
    }
    return index;
}

/**
 * The dictionary file's full text.
 *
 * <p>Sorted with the default comparison rather than a locale-aware one, so that the
 * output is a pure function of the sources: the index is built from a directory walk
 * whose order nothing guarantees, and only a stable sort makes "has it changed?" a
 * question about the project instead of about the machine it ran on.
 */
export function namesDictionary(index: NameIndex): string {
    const words = new Set<string>();
    for (const fileWords of index.values()) {
        fileWords.forEach(w => words.add(w));
    }
    return dictionaryFile([...words].sort());
}

/**
 * Write only when the content differs, and say whether it did.
 *
 * <p>The guard is not an optimisation. cSpell reloads a custom dictionary when its
 * file changes and re-checks every open document, so an identical rewrite on each
 * save would make the whole project flicker for no reason at all.
 */
export function writeIfChanged(target: string, contents: string): boolean {
    try {
        if (fs.readFileSync(target, 'utf8') === contents) {
            return false;
        }
    } catch {
        // Absent or unreadable: either way, writing it is the answer.
    }
    fs.writeFileSync(target, contents, 'utf8');
    return true;
}
