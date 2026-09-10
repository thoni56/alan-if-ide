import { ALAN_PATTERNS, ALAN_INCLUDE, ALAN_IGNORE, CODE_DICTIONARIES } from './spelling';

/**
 * The brief an Alan project needs, and the catalogue of languages it is chosen from.
 *
 * <p>THE VOCABULARY, because it is the design:
 *
 * <p>The BRIEF tells the proofreader where the prose is and which lists to trust --
 * the CONCORDANCE, which we regenerate, and the GLOSSARY, which is the author's and
 * which we never touch.
 *
 * <p>The brief is cspell.json. The concordance is alan-concordance.txt, derived from
 * the game's own declarations by names.ts and rebuilt whenever the sources move. The
 * glossary is the `words` list inside the brief, where cSpell's "Add to dictionary"
 * puts an author's decisions -- a surname in the credits, a dialect spelling -- and it
 * is the reason the concordance is registered with `addWords: false`. The third list is
 * simply the LANGUAGE, en or it or en,it, which is not about this game at all.
 *
 * <p>Everything here is pure text and data, so the shape of the file the author ends
 * up with can be tested without a running editor. The command in spellcheck.ts is the
 * half that asks and writes.
 *
 * <p>This config was not designed on paper: it is the file that was hand-written into
 * a real 83-file project and measured with the real cSpell, where it took the run from
 * 178 unknown words to 57. What is encoded below is that file.
 */

/** The checker itself. Everything else is optional; without this, nothing checks. */
export const CSPELL_EXTENSION = 'streetsidesoftware.code-spell-checker';

/** The brief. */
export const BRIEF_FILE = 'cspell.json';

/** What cSpell calls Alan files, which is our language id. */
export const ALAN_FILE_TYPE = 'alanif';

/**
 * The concordance. "project" would be redundant in the name: a concordance is of a
 * work by definition, which is the whole reason the word earns its place here.
 */
export const CONCORDANCE_FILE = 'alan-concordance.txt';

/** The dictionary name the concordance is registered under, inside the brief. */
const CONCORDANCE_DICTIONARY = 'alan-concordance';

/**
 * A language the author can write their game in.
 *
 * <p>`extension` is absent for exactly one entry, and that absence is the whole
 * reason this type is not just a string: Code Spell Checker bundles English and
 * nothing else, so every other language costs an install. An author choosing
 * English should not be asked to download anything, and an author choosing Italian
 * must be told that they are.
 */
export interface Language {
    /** As the author would name it, and as the quick pick lists it. */
    name: string;
    /** What goes in cSpell's `language` setting: `it`, `en-GB`, `pt-BR`. */
    code: string;
    /** Marketplace id, or undefined when cSpell already has this language. */
    extension?: string;
}

/** English, which is already there. Listed first, so that fact is visible. */
export const BUNDLED: Language = { name: 'English', code: 'en' };

/**
 * Every other language Code Spell Checker's publisher provides a dictionary for.
 *
 * <p>The publisher's catalogue rather than a shortlist of ours, deliberately. Alan
 * games exist in English and Italian today, which is precisely the reason not to
 * pick the list ourselves: the next one will be in a language nobody thought to ask
 * about, and a game whose language is missing from the list reads as a game the IDE
 * does not support. Several entries are variants rather than languages of their own
 * -- en-GB, de-AT, pt-BR -- and they matter for the same reason.
 */
export const LANGUAGES: Language[] = [
    ['Ancient Greek', 'grc', 'ancient-greek'],
    ['Arabic', 'ar', 'arabic'],
    ['Armenian', 'hy', 'armenian'],
    ['Australian English', 'en-AU', 'australian-english'],
    ['Austrian German', 'de-AT', 'austrian-german'],
    ['Basque', 'eu', 'basque'],
    ['Belarusian', 'be', 'belarusian'],
    ['Brazilian Portuguese', 'pt-BR', 'portuguese-brazilian'],
    ['British English', 'en-GB', 'british-english'],
    ['British English -ise', 'en-GB-ise', 'british-english-ise'],
    ['Bulgarian', 'bg', 'bulgarian'],
    ['Canadian English', 'en-CA', 'canadian-english'],
    ['Catalan', 'ca', 'catalan'],
    ['Croatian', 'hr', 'croatian'],
    ['Czech', 'cs', 'czech'],
    ['Danish', 'da', 'danish'],
    ['Dutch', 'nl', 'dutch'],
    ['Esperanto', 'eo', 'esperanto'],
    ['Estonian', 'et', 'estonian'],
    ['Finnish', 'fi', 'finnish'],
    ['French', 'fr', 'french'],
    ['French Réforme 90', 'fr-reforme', 'french-reforme'],
    ['Galician', 'gl', 'galician'],
    ['German', 'de', 'german'],
    ['Greek', 'el', 'greek'],
    ['Hebrew', 'he', 'hebrew'],
    ['Hungarian', 'hu', 'hungarian'],
    ['Indonesian', 'id', 'indonesian'],
    ['Italian', 'it', 'italian'],
    ['Latin', 'la', 'latin'],
    ['Latvian', 'lv', 'latvian'],
    ['Lithuanian', 'lt', 'lithuanian'],
    ['Macedonian', 'mk', 'macedonian'],
    ['Mongolian', 'mn', 'mongolian'],
    ['Norwegian Bokmål', 'nb', 'norwegian-bokmal'],
    ['Persian', 'fa', 'persian'],
    ['Polish', 'pl', 'polish'],
    ['Portuguese', 'pt', 'portuguese'],
    ['Romanian', 'ro', 'romanian'],
    ['Russian', 'ru', 'russian'],
    ['Serbian', 'sr', 'serbian'],
    ['Slovak', 'sk', 'slovak'],
    ['Slovenian', 'sl', 'slovenian'],
    ['Spanish', 'es', 'spanish'],
    ['Swedish', 'sv', 'swedish'],
    ['Swiss German', 'de-CH', 'swiss-german'],
    ['Turkish', 'tr', 'turkish'],
    ['Ukrainian', 'uk', 'ukrainian'],
    ['Vietnamese', 'vi', 'vietnamese'],
].map(([name, code, id]) => ({ name, code, extension: `${CSPELL_EXTENSION}-${id}` }));

/** English, then the rest -- the order the picker shows and the config records. */
export const ALL_LANGUAGES: Language[] = [BUNDLED, ...LANGUAGES];

/** The languages a set of codes names, in catalogue order. */
export function languagesFor(codes: string[]): Language[] {
    return ALL_LANGUAGES.filter(d => codes.includes(d.code));
}

/** How to say a chosen set of languages to a human: "English and Italian". */
export function languageNames(codes: string[]): string {
    const names = languagesFor(codes).map(d => d.name);
    if (names.length === 0) { return BUNDLED.name; }
    if (names.length === 1) { return names[0]; }
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The keys we own, and nothing else: what this IDE knows that cSpell cannot. */
function alanKeys(languages: string[]): Record<string, unknown> {
    return {
        language: (languages.length > 0 ? languages : [BUNDLED.code]).join(','),
        // WHERE "Add to dictionary" MAY WRITE. Only the brief, which travels with the
        // game: user settings would make one game's invented words correct in every
        // other project, and an author who chose it would never connect the two.
        // EVERY KEY, spelled out: measured against cSpell 4.9.1, a partial object
        // leaves the rest unset here rather than at their defaults, which removes the
        // targets we mean to keep. In VS Code's own settings the defaults do apply.
        allowWordsToBeAddTo: {
            cspell: true,
            dictionaries: true,
            user: false,
            workspace: false,
            folder: false,
        },
        patterns: ALAN_PATTERNS,
        dictionaryDefinitions: [{
            name: CONCORDANCE_DICTIONARY,
            path: `./${CONCORDANCE_FILE}`,
            // Never the target of "Add to dictionary". The concordance is rebuilt
            // from the sources, so a word added here would disappear at the next
            // save -- silently, which is the worst way for a decision to be lost.
            // The author's own words are the glossary, in `words` below, where
            // cSpell puts them.
            addWords: false,
        }],
        languageSettings: [{
            // Scoped to the language, never top-level. Top-level includeRegExpList
            // would restrict checking to Alan strings in EVERY file of the workspace,
            // so the author's own README would be checked only inside its quotes.
            languageId: ALAN_FILE_TYPE,
            includeRegExpList: ALAN_INCLUDE,
            ignoreRegExpList: ALAN_IGNORE,
            dictionaries: [CONCORDANCE_DICTIONARY, ...CODE_DICTIONARIES.map(d => `!${d}`)],
        }],
    };
}

/**
 * Names the concordance dictionary has had, which are ours to replace.
 *
 * <p>NOTHING COMES OFF THIS LIST. A brief lives in an author's game folder and is
 * rewritten only when they run the setup command again, which may be never -- so a
 * name we wrote once can still be sitting in a file years later, pointing cSpell at a
 * list nothing updates. `alan-project-names` was the concordance for one day, between
 * 0.7.12 and f41e6a6.
 */
const LEGACY_DICTIONARIES = ['alan-project-names'];

/** Whether a `patterns` or `languageSettings` entry is one of ours. */
function ours(key: string, entry: unknown): boolean {
    const named = entry as { name?: unknown; languageId?: unknown };
    if (key === 'languageSettings') { return named?.languageId === ALAN_FILE_TYPE; }
    const mine = key === 'dictionaryDefinitions'
        ? [CONCORDANCE_DICTIONARY, ...LEGACY_DICTIONARIES]
        : ALAN_PATTERNS.map(p => p.name);
    return typeof named?.name === 'string' && mine.includes(named.name);
}

export type Brief =
    | { ok: true; text: string }
    | { ok: false; reason: string };

/**
 * The brief to write, given whatever is already there.
 *
 * <p>MERGED, never replaced, because the brief is where the glossary lives: cSpell's
 * own "Add to dictionary" writes the author's words into it, and a project may already
 * have a brief of its own for its prose or its README. So our entries are removed by
 * name and re-appended, which makes running the command twice produce the same file,
 * while every key we do not own -- `words` above all -- is carried through untouched.
 *
 * <p>We refuse rather than guess when the file is not what we expect. An unparseable
 * brief, or one whose `patterns` is not a list, is a file we would have to damage to
 * write into -- and it is a manuscript's spelling settings, not scratch.
 */
export function briefFor(existing: string | undefined, languages: string[]): Brief {
    const keys = alanKeys(languages);
    if (existing === undefined) {
        return { ok: true, text: text({ version: '0.2', words: [], ...keys }) };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(existing);
    } catch {
        return { ok: false, reason: `${BRIEF_FILE} is not valid JSON` };
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, reason: `${BRIEF_FILE} does not hold a JSON object` };
    }

    const config = parsed as Record<string, unknown>;
    const lists = ['patterns', 'dictionaryDefinitions', 'languageSettings'];
    for (const key of lists) {
        if (config[key] !== undefined && !Array.isArray(config[key])) {
            return { ok: false, reason: `${BRIEF_FILE}'s "${key}" is not a list` };
        }
    }

    const merged: Record<string, unknown> = { version: '0.2', words: [], ...config };
    merged.language = keys.language;
    merged.allowWordsToBeAddTo = keys.allowWordsToBeAddTo;
    for (const key of lists) {
        const kept = ((config[key] as unknown[]) ?? []).filter(e => !ours(key, e));
        merged[key] = [...kept, ...(keys[key] as unknown[])];
    }
    return { ok: true, text: text(merged) };
}

function text(config: Record<string, unknown>): string {
    return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * The .gitignore to write, or undefined when the file already covers us.
 *
 * <p>The concordance is derived from the sources, so committing it would put a second
 * source of truth under version control and make a rename touch both. A read-through
 * in a fresh clone is the cure, and the command is the way to ask for one.
 */
export function gitignoreFor(existing: string | undefined): string | undefined {
    const lines = (existing ?? '').split('\n').map(l => l.trim());
    if (lines.some(l => l === CONCORDANCE_FILE || l === `/${CONCORDANCE_FILE}`)) {
        return undefined;
    }
    const before = existing === undefined || existing === '' ? ''
        : existing.endsWith('\n') ? existing : `${existing}\n`;
    return `${before}\n# Generated by Alan IF IDE from this project's own sources.\n`
        + `/${CONCORDANCE_FILE}\n`;
}

/** What Check Setup can see about spell checking in one folder. */
export interface SpellCheckingFacts {
    /** The folder being reported on; absent when no folder is open. */
    folder?: string;
    extensionInstalled: boolean;
    /** cspell.json is present, which is how a folder says it opted in. */
    brief: boolean;
    /** Names in the concordance; absent when the file itself is missing. */
    names?: number;
    /**
     * cSpell has been told not to check Alan files. Only ever set from an explicit
     * `alanif: false`; see {@link fileTypeDisabledBy}.
     */
    fileTypeDisabled?: boolean;
    /**
     * The brief names a dictionary we stopped writing, so cSpell is reading a list
     * nothing updates; see {@link wordListIsStale}.
     */
    wordListStale?: boolean;
}

/**
 * Whether the brief itself turns Alan files off.
 *
 * <p>cSpell's `Disable File Type` asks where to write, and cspell.json is one of the
 * answers -- the one an author of ours is likeliest to pick, since it is the file the
 * setup command left in their folder. Written there it is invisible to VS Code's
 * settings API, so the brief has to be read as well.
 *
 * <p>Unparseable counts as nothing said. A brief mid-edit is not a statement.
 */
export function fileTypeDisabledInBrief(text: string | undefined): boolean {
    return fileTypeStateInBrief(text) === false;
}

/** What the brief says about Alan files: on, off, or nothing. */
export function fileTypeStateInBrief(text: string | undefined): boolean | undefined {
    if (text === undefined || text.trim() === '') { return undefined; }
    try {
        return fileTypeStateBy(
            (JSON.parse(text) as Record<string, unknown>)['enabledFileTypes']);
    } catch {
        return undefined;
    }
}

/**
 * Whether the brief points cSpell at a word list nothing writes any more.
 *
 * <p>NARROW ON PURPOSE: a legacy definition and no current one. A brief holding both
 * was written by a version that knows the current name, so its languageSettings name
 * that one and there is nothing wrong. Unparseable says nothing, as everywhere else.
 */
export function wordListIsStale(brief: string | undefined): boolean {
    if (brief === undefined || brief.trim() === '') { return false; }
    let defined: unknown;
    try {
        defined = (JSON.parse(brief) as Record<string, unknown>)['dictionaryDefinitions'];
    } catch {
        return false;
    }
    if (!Array.isArray(defined)) { return false; }
    const names = defined.map(d => (d as { name?: unknown })?.name);
    return names.some(n => typeof n === 'string' && LEGACY_DICTIONARIES.includes(n))
        && !names.includes(CONCORDANCE_DICTIONARY);
}

/** The levels VS Code reports a setting at, nearest last in specificity. */
export interface ConfigScopes {
    globalValue?: unknown;
    workspaceValue?: unknown;
    workspaceFolderValue?: unknown;
}

/**
 * Whether the scope that decides `cSpell.enabledFileTypes` turns Alan files off.
 *
 * <p>THE NEAREST SCOPE THAT SETS THE KEY AT ALL DECIDES. The setting is `scope:
 * resource`, so user, workspace and folder can each hold one, and whether VS Code
 * merges the objects or lets the nearest replace the rest is unverified. Reading only
 * the nearest is right under the replace reading, and under the merge reading it can
 * miss a `false` set further out -- which leaves the row saying what it said before.
 */
export function fileTypeDisabledIn(scopes: ConfigScopes | undefined): boolean {
    return fileTypeStateIn(scopes) === false;
}

/** What VS Code's settings say about Alan files: on, off, or nothing. */
export function fileTypeStateIn(scopes: ConfigScopes | undefined): boolean | undefined {
    const nearest = [
        scopes?.workspaceFolderValue,
        scopes?.workspaceValue,
        scopes?.globalValue,
    ].find(value => value !== undefined);
    return fileTypeStateBy(nearest);
}

/**
 * Whether Alan files are turned off, reading both places that can say so.
 *
 * <p>THE BRIEF DECIDES WHENEVER IT SAYS ANYTHING. Measured 2026-09-09: with the brief
 * saying `true` and workspace settings saying `false`, cSpell went on checking. One
 * round trip through cSpell's own Disable/Enable menu is enough to leave a `true` in
 * one place and a `false` in the other, so this is the ordinary case, not a corner.
 */
export function fileTypeDisabledFor(
    brief: string | undefined, scopes: ConfigScopes | undefined,
): boolean {
    const said = fileTypeStateInBrief(brief);
    return (said ?? fileTypeStateIn(scopes)) === false;
}

/**
 * Whether `cSpell.enabledFileTypes` explicitly turns Alan files off.
 *
 * <p>ONE ENTRY, READ LITERALLY. cSpell decides what it checks from three settings and
 * a default of `{"*": true}`, and this reproduces none of that. A blanket `"*": false`,
 * the legacy `enableFiletypes` array, anything we cannot read: all stay quiet. The cost
 * of a false negative is the row saying nothing new, which is where it was; the cost of
 * a false positive is telling an author their setup is broken when it is not.
 */
export function fileTypeDisabledBy(enabledFileTypes: unknown): boolean {
    return fileTypeStateBy(enabledFileTypes) === false;
}

/**
 * What one `enabledFileTypes` object says about Alan files: on, off, or nothing.
 *
 * <p>THE THIRD ANSWER IS THE POINT. Two sources can hold this key, so "says nothing"
 * has to be distinguishable from "says yes" -- otherwise a brief that is merely quiet
 * cannot let the settings speak, and a brief that says yes cannot outrank them.
 */
export function fileTypeStateBy(enabledFileTypes: unknown): boolean | undefined {
    if (typeof enabledFileTypes !== 'object' || enabledFileTypes === null) { return undefined; }
    if (Array.isArray(enabledFileTypes)) { return undefined; }
    const said = (enabledFileTypes as Record<string, unknown>)[ALAN_FILE_TYPE];
    return typeof said === 'boolean' ? said : undefined;
}

/** A row for the setup check: what to say, whether to worry, and the way out. */
export interface SpellCheckingReport {
    text: string;
    /**
     * The same state for the language status bubble, which cannot be widened and so
     * gets the state alone -- the folder goes in that surface's detail line.
     */
    short: string;
    detail: string;
    attention: boolean;
    action: 'setup' | 'install-extension' | 'open-folder' | 'enable-file-type' | 'none';
}

/**
 * What Check Setup says about spell checking.
 *
 * <p>THE RULE, and it generalises: ANYTHING AN AUTHOR MIGHT HAVE TO SET UP BELONGS
 * HERE. Setup state that is only visible by looking for files in a folder is state an
 * author cannot report and we cannot ask about, so every question we would otherwise
 * put to them by mail is one this surface should already have answered.
 *
 * <p>OPTING IN IS PER FOLDER, and that is the fact this row exists to make visible.
 * An author who ran the command once reasonably believes it is on -- editor settings
 * usually are -- so the folder is NAMED in every answer rather than mentioned only
 * when something is wrong.
 *
 * <p>NOT SET UP IS NOT A FAULT. Spell checking is optional, and an author who never
 * wanted it must never be told they are missing something. Set up and NOT WORKING is
 * a fault: they asked for it, and are not getting it.
 */
export function describeSpellChecking(facts: SpellCheckingFacts): SpellCheckingReport {
    const {
        folder, extensionInstalled, brief, names, fileTypeDisabled, wordListStale,
    } = facts;

    if (folder === undefined) {
        return {
            text: 'no folder open',
            short: 'Alan spell checking',
            detail: 'Open the folder holding your game to set up or check spell checking.',
            attention: false,
            action: 'open-folder',
        };
    }

    // Opted in, but the checker that would act on it is not there. The files are all
    // correct and nothing happens, which is the one state an author cannot diagnose.
    if (brief && !extensionInstalled) {
        return {
            text: `set up in ${folder}, but not running`,
            short: 'Alan spell checking not running',
            detail: `This folder is set up, but the Code Spell Checker extension `
                + `(${CSPELL_EXTENSION}) is not installed, so nothing is checked.`,
            attention: true,
            action: 'install-extension',
        };
    }

    if (!brief) {
        return {
            text: `not set up in ${folder}`,
            short: 'Alan spell checking not set up',
            detail: 'Set Up Spell Checking writes a word list built from the names your '
                + 'own sources declare, so your locations and characters stop being '
                + 'marked. Setting up is per folder, so each game asks separately.',
            attention: false,
            action: 'setup',
        };
    }

    // Set up, and switched off underneath. This comes before the name-count faults
    // because it is why nothing happens: a perfect list is checked against nothing.
    if (fileTypeDisabled) {
        return {
            text: `set up in ${folder}, but Alan files are not being checked`,
            short: 'Alan spell checking \u2014 not checked',
            detail: 'Spell checking is set up in this folder, but cSpell has been told '
                + 'not to check Alan files, so nothing in them is checked. Enable it '
                + 'again to get what this folder is set up for.',
            attention: true,
            action: 'enable-file-type',
        };
    }

    // Set up under a version that named the concordance differently. cSpell is
    // reading a file nothing has written since, so the count below would be a count
    // of the wrong file. Running Set Up again migrates the brief.
    if (wordListStale) {
        return {
            text: `set up in ${folder}, but the word list is not being kept current`,
            short: 'Alan spell checking \u2014 out of date',
            detail: 'This folder was set up by an older version, and the word list it '
                + 'names is no longer the one being rebuilt from your sources. Run Set '
                + 'Up Spell Checking again to point it at the current one.',
            attention: true,
            action: 'setup',
        };
    }

    // The brief is here, so it was asked for. Anything short of a populated
    // concordance means the author is not getting what they asked for.
    if (names === undefined) {
        return {
            text: `set up in ${folder}, but the name list is missing`,
            short: 'Alan spell checking — no name list',
            detail: `${CONCORDANCE_FILE} is not in this folder. Run Set Up Spell `
                + 'Checking again to rebuild it from your sources.',
            attention: true,
            action: 'setup',
        };
    }
    if (names === 0) {
        return {
            text: `set up in ${folder}, but no names were collected`,
            short: 'Alan spell checking — no names',
            detail: 'No player-facing names were found in this folder\'s sources. If the '
                + 'game is here, run Set Up Spell Checking again; if it is somewhere '
                + 'else, run it there.',
            attention: true,
            action: 'setup',
        };
    }
    return {
        text: `set up in ${folder}`,
            short: `Alan spell checking — ${names} names`,
        detail: `${names} names collected from your sources into ${CONCORDANCE_FILE}, `
            + `rebuilt whenever you save. Your own additions live in ${BRIEF_FILE}.`,
        attention: false,
        action: 'none',
    };
}
