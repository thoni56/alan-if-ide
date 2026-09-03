import * as fs from 'fs';
import * as path from 'path';
import { followImports, sourceText } from './encoding';
import { contribution, concordanceText } from './spelling';

/**
 * The concordance: every player-facing name the project declares, gathered from the
 * sources it declares them in.
 *
 * <p>A concordance is derived from the work by machine, and that is the whole of what
 * this file is. cspell.ts writes the other half, the brief. See its header for how the
 * three lists fit together.
 *
 * <p>This is the half of spell checking that decides whether an author keeps it
 * switched on. Wyldkynd's prose is ordinary English -- only 101 distinct words in it
 * are unknown to a dictionary at all -- and nearly every one of those is a name the
 * author invented. Feeding the game's own declarations back in takes cSpell from 178
 * unknown words to 57, and what survives is almost entirely real: typos in shipped
 * prose, and misspellings of the game's own characters. Holding the CORRECT spelling
 * of Aerrowan is precisely what makes `Arrowan` stand out.
 *
 * <p>The concordance is DERIVED, so it is machine-owned: generated, gitignored, and
 * always correct to rebuild. The author's own words are the glossary, and they live in
 * the brief instead, where cSpell's "Add to dictionary" puts them -- so rebuilding the
 * concordance can never silently discard a decision the author made.
 *
 * <p>CONTRIBUTIONS ARE HELD PER FILE, not as one flat set, because that is what makes
 * the touch-up possible: on save, one file's contribution is replaced wholesale and the
 * concordance settles -- it is rewritten only if the sorted list actually changed.
 * Prose edits vastly outnumber name changes, and cSpell re-checks every open document
 * whenever a dictionary file changes, so writing an identical file on every save would
 * make the whole project flicker for nothing.
 */

/** Each source file, by resolved path, and the words it contributes. */
export type Contributions = Map<string, string[]>;

/**
 * The extensions the read-through's glob collects, so that a save is judged by the
 * same rule the full pass used rather than by a second one that could disagree.
 */
const SOURCE = /\.(alan|i)$/i;

/**
 * Whether a file could contribute to this project at all: an Alan source inside the
 * folder. Cheap, and answerable before anything has been read.
 */
export function couldContribute(root: string, file: string): boolean {
    const here = path.resolve(file);
    return SOURCE.test(here) && here.startsWith(path.resolve(root) + path.sep);
}

/**
 * Whether a save changes this project's concordance -- the question a save handler
 * must answer before it does anything at all.
 *
 * <p>Two ways in, and the second is not redundant. The trail leaves the folder: an
 * Italian game is one file importing a library two directories up, and that library
 * is where the unusual names are. So a file that ALREADY contributes goes on
 * contributing wherever it lives and whatever it is called, since an Import can name
 * any extension it likes.
 */
export function affects(root: string, file: string, contributions: Contributions): boolean {
    return contributions.has(path.resolve(file)) || couldContribute(root, file);
}

/**
 * The read-through: every file in the reach re-contributes, from nothing.
 *
 * <p>Pass the workspace's own sources as `roots`: they are visited too, so the walk
 * yields the union of what the author has open and what the compile imports from
 * outside the folder. This is also the cure for drift -- a pull, a rename, an edit
 * made in another editor -- which is why it clears first rather than merging into
 * what is already there.
 */
export function readThrough(
    roots: string[],
    contributions: Contributions,
    unreadable: string[] = [],
): Contributions {
    contributions.clear();
    followImports(roots, (file, bytes) => {
        contributions.set(file, contribution(sourceText(bytes)));
    }, unreadable);
    return contributions;
}

/**
 * The touch-up: one file re-contributes, for the save that just happened.
 *
 * <p>A file we can no longer read drops out entirely rather than keeping its old
 * words: that is what makes a deleted file's names disappear, and a name that has
 * been renamed away stop vouching for itself. Nothing is reported, because this runs
 * on every save -- the file the author just deleted is not a problem to announce.
 */
export function touchUp(file: string, contributions: Contributions): Contributions {
    const here = path.resolve(file);
    try {
        contributions.set(here, contribution(sourceText(fs.readFileSync(here))));
    } catch {
        contributions.delete(here);
    }
    return contributions;
}

/**
 * The concordance's full text: every contribution, merged and sorted.
 *
 * <p>The union is recomputed rather than patched, because a name can be declared in
 * two files: dropping it from one contribution does not mean it leaves the concordance,
 * and only the union knows that.
 *
 * <p>Sorted with the default comparison rather than a locale-aware one, so that the
 * output is a pure function of the sources: contributions are gathered by a directory
 * walk whose order nothing guarantees, and only a stable sort makes "has it changed?"
 * a question about the project instead of about the machine it ran on.
 */
export function concordance(contributions: Contributions): string {
    const words = new Set<string>();
    for (const contributed of contributions.values()) {
        contributed.forEach(w => words.add(w));
    }
    return concordanceText([...words].sort());
}

/**
 * Settling: write only when the text has actually moved, and say whether it did.
 *
 * <p>The interesting outcome is the one where nothing is written, so the guard is not
 * an optimisation. cSpell reloads a custom dictionary when its file changes and
 * re-checks every open document, so an identical rewrite on each save would make the
 * whole project flicker for no reason at all. Named for the mechanic rather than the
 * domain because that is all it is: no part of it knows about concordances.
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
