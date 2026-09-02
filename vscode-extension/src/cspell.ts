import { ALAN_PATTERNS, ALAN_INCLUDE, ALAN_IGNORE, CODE_DICTIONARIES } from './spelling';

/**
 * The cspell.json an Alan project needs, and the catalogue it is chosen from.
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

export const CSPELL_FILE = 'cspell.json';
export const NAMES_FILE = 'alan-project-names.txt';

/** The dictionary name our generated word list is registered under. */
const NAMES_DICTIONARY = 'alan-project-names';

/**
 * A language the author can write their game in.
 *
 * <p>`extension` is absent for exactly one entry, and that absence is the whole
 * reason this type is not just a string: Code Spell Checker bundles English and
 * nothing else, so every other language costs an install. An author choosing
 * English should not be asked to download anything, and an author choosing Italian
 * must be told that they are.
 */
export interface Dictionary {
    /** As the author would name it, and as the quick pick lists it. */
    name: string;
    /** What goes in cSpell's `language` setting: `it`, `en-GB`, `pt-BR`. */
    code: string;
    /** Marketplace id, or undefined when cSpell already has this language. */
    extension?: string;
}

/** English, which is already there. Listed first, so that fact is visible. */
export const BUNDLED: Dictionary = { name: 'English', code: 'en' };

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
export const DICTIONARIES: Dictionary[] = [
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
export const ALL_DICTIONARIES: Dictionary[] = [BUNDLED, ...DICTIONARIES];

/** The languages a set of codes names, in catalogue order. */
export function dictionariesFor(codes: string[]): Dictionary[] {
    return ALL_DICTIONARIES.filter(d => codes.includes(d.code));
}

/** How to say a chosen set of languages to a human: "English and Italian". */
export function languageNames(codes: string[]): string {
    const names = dictionariesFor(codes).map(d => d.name);
    if (names.length === 0) { return BUNDLED.name; }
    if (names.length === 1) { return names[0]; }
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The keys we own, and nothing else: what this IDE knows that cSpell cannot. */
function alanKeys(languages: string[]): Record<string, unknown> {
    return {
        language: (languages.length > 0 ? languages : [BUNDLED.code]).join(','),
        patterns: ALAN_PATTERNS,
        dictionaryDefinitions: [{
            name: NAMES_DICTIONARY,
            path: `./${NAMES_FILE}`,
            // Never the target of "Add to dictionary". This file is regenerated from
            // the sources, so a word added here would disappear at the next save --
            // silently, which is the worst way for a decision to be lost. The
            // author's own words belong in `words` below, where cSpell puts them.
            addWords: false,
        }],
        languageSettings: [{
            // Scoped to the language, never top-level. Top-level includeRegExpList
            // would restrict checking to Alan strings in EVERY file of the workspace,
            // so the author's own README would be checked only inside its quotes.
            languageId: 'alanif',
            includeRegExpList: ALAN_INCLUDE,
            ignoreRegExpList: ALAN_IGNORE,
            dictionaries: [NAMES_DICTIONARY, ...CODE_DICTIONARIES.map(d => `!${d}`)],
        }],
    };
}

/** Whether a `patterns` or `languageSettings` entry is one of ours. */
function ours(key: string, entry: unknown): boolean {
    const named = entry as { name?: unknown; languageId?: unknown };
    if (key === 'languageSettings') { return named?.languageId === 'alanif'; }
    const mine = key === 'dictionaryDefinitions'
        ? [NAMES_DICTIONARY]
        : ALAN_PATTERNS.map(p => p.name);
    return typeof named?.name === 'string' && mine.includes(named.name);
}

export type Config =
    | { ok: true; text: string }
    | { ok: false; reason: string };

/**
 * The cspell.json to write, given whatever is already there.
 *
 * <p>MERGED, never replaced. This file is the author's: cSpell's own "Add to
 * dictionary" writes their words into it, and a project may already have one for
 * its prose or its README. So our entries are removed by name and re-appended,
 * which makes running the command twice produce the same file, while every key we
 * do not own is carried through untouched.
 *
 * <p>We refuse rather than guess when the file is not what we expect. An unparseable
 * cspell.json, or one whose `patterns` is not a list, is a file we would have to
 * damage to write into -- and it is a manuscript's spelling settings, not scratch.
 */
export function configFor(existing: string | undefined, languages: string[]): Config {
    const keys = alanKeys(languages);
    if (existing === undefined) {
        return { ok: true, text: text({ version: '0.2', words: [], ...keys }) };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(existing);
    } catch {
        return { ok: false, reason: `${CSPELL_FILE} is not valid JSON` };
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, reason: `${CSPELL_FILE} does not hold a JSON object` };
    }

    const config = parsed as Record<string, unknown>;
    const lists = ['patterns', 'dictionaryDefinitions', 'languageSettings'];
    for (const key of lists) {
        if (config[key] !== undefined && !Array.isArray(config[key])) {
            return { ok: false, reason: `${CSPELL_FILE}'s "${key}" is not a list` };
        }
    }

    const merged: Record<string, unknown> = { version: '0.2', words: [], ...config };
    merged.language = keys.language;
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
 * <p>The word list is derived from the sources, so committing it would put a second
 * source of truth under version control and make a rename touch both. Regenerating
 * in a fresh clone is the repair, and the command is the way to do it.
 */
export function gitignoreFor(existing: string | undefined): string | undefined {
    const lines = (existing ?? '').split('\n').map(l => l.trim());
    if (lines.some(l => l === NAMES_FILE || l === `/${NAMES_FILE}`)) {
        return undefined;
    }
    const before = existing === undefined || existing === '' ? ''
        : existing.endsWith('\n') ? existing : `${existing}\n`;
    return `${before}\n# Generated by Alan IF IDE from this project's own sources.\n`
        + `/${NAMES_FILE}\n`;
}
