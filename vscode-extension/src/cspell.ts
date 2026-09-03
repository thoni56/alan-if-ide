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
            languageId: 'alanif',
            includeRegExpList: ALAN_INCLUDE,
            ignoreRegExpList: ALAN_IGNORE,
            dictionaries: [CONCORDANCE_DICTIONARY, ...CODE_DICTIONARIES.map(d => `!${d}`)],
        }],
    };
}

/** Whether a `patterns` or `languageSettings` entry is one of ours. */
function ours(key: string, entry: unknown): boolean {
    const named = entry as { name?: unknown; languageId?: unknown };
    if (key === 'languageSettings') { return named?.languageId === 'alanif'; }
    const mine = key === 'dictionaryDefinitions'
        ? [CONCORDANCE_DICTIONARY]
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
