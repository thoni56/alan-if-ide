import { stringSpans } from './strings';

/**
 * Teach a spell checker where an Alan author's prose is, and what it is made of.
 *
 * <p>We do not check spelling ourselves -- Code Spell Checker does that, and does it
 * better than we would, with dictionaries in the author's own language. What no
 * general checker can know is the three Alan-specific things below, each of which
 * was measured on the real 83-file Wyldkynd project rather than guessed at. Without
 * them cSpell reports 178 unknown words there; with them, 57, and those 57 are almost
 * all real: typos in shipped prose, and misspellings of the game's own invented names.
 */

/**
 * The regions worth checking, and the text inside them that is not a word.
 *
 * <p>WHERE THE PROSE IS: only string literals. Everything else is either the
 * author's own notes or identifiers they invented, and flagging `The chius Isa
 * object` teaches an author to switch the checker off.
 *
 * <p>THE MARKERS: `$p` and `$n` glue to whatever follows, so `$pand` reaches a
 * checker as the word "pand" and every paragraph of the game lights up. Excluding
 * the marker itself splits the token rather than joining it, which is what makes
 * the following word check as itself.
 *
 * <p>THE GLUE: `$$` joins two literals with nothing between them, which the Italian
 * library uses to build gendered endings -- `"chius$$" SAY THIS:vocale.` So a word
 * touching `$$` is a FRAGMENT, not a word, and no dictionary in any language can
 * hold it. Same for the `$+1` form. This is the rule nobody predicted, including
 * the person who designed the markers.
 */
export const ALAN_PATTERNS = [
    { name: 'alan-string', pattern: '/"(?:[^"]|"")*"/g' },
    { name: 'alan-marker', pattern: '/\\$[a-zA-Z$]/g' },
    {
        name: 'alan-glued',
        pattern: '/[A-Za-z\\u00C0-\\u024F]+\\$\\$|\\$\\$[A-Za-z\\u00C0-\\u024F]+'
            + '|[A-Za-z\\u00C0-\\u024F]*\\$\\+\\d+[A-Za-z\\u00C0-\\u024F]*/g',
    },
];

export const ALAN_INCLUDE = ['alan-string'];
export const ALAN_IGNORE = ['alan-marker', 'alan-glued'];

/**
 * Dictionaries that are wrong for prose, however right they are for code.
 *
 * <p>cSpell ships with a programming stack enabled by default, and it does not just
 * add jargon: `teh` is a valid word because it appears in the AWS dictionary. An
 * author writing a novel should not have a classic typo silently accepted because
 * of a cloud provider's API names.
 */
export const CODE_DICTIONARIES = [
    'aws', 'softwareTerms', 'node', 'typescript', 'php', 'go', 'python',
    'companies', 'npm', 'html', 'css', 'fonts', 'latex', 'dotnet', 'bash', 'cpp', 'java',
];

/**
 * The declarations whose names an author also writes in their prose.
 *
 * <p>MEASURED, and then corrected by Thomas. Ranking kinds by how much they helped on
 * the two games to hand would have dropped verbs and exits, which rescued nothing
 * there -- but the games that need this most are the unwritten ones, where the verb
 * IS the invented word ("Aguamenti Maxima", "xyzzy"). So the rule is COST, not value:
 * a kind belongs here when its names are the player's vocabulary and its dead weight
 * is low. Measured dead-weight rates: name 0.7%, verb 0.7%, syntax 0.8%, exit 0%,
 * instance 1.2%, synonym 2.1%, class 10% -- against attribute 13.5% and event 4.8%,
 * whose names the player never sees and whose entries can only mask a real typo.
 */
const PLAYER_FACING = [
    /^\s*the\s+(IDENT)\b/i,                      // instance
    /^\s*every\s+(IDENT)\b/i,                    // class
    /^\s*add\s+to\s+every\s+(IDENT)\b/i,         // addition
    /^\s*verb\s+(IDENT(?:\s*,\s*IDENT)*)/i,      // verb, and its aliases
    /^\s*syntax\s+(IDENT)\b/i,
];

const IDENT = "(?:[A-Za-z_\\u00C0-\\u024F][A-Za-z_0-9\\u00C0-\\u024F]*|'(?:[^']|'')*')";
const ident = (re: RegExp) => new RegExp(re.source.replace(/IDENT/g, IDENT), re.flags);
// Several Name clauses may share a line (`Name queen Name fairy queen`), so the run
// of words stops at the next Name rather than swallowing the keyword as an identifier.
const NAME_CLAUSE = ident(/\bname\b((?:\s+(?!name\b)IDENT)+)/gi);
const SYNONYMS = ident(/^\s*synonyms?\b([^=]*)=/i);
const EXIT = ident(/^\s*exit\s+(.*?)\bto\b/i);

/**
 * One file's contribution to the concordance: every player-facing word it declares.
 *
 * <p>Strings are blanked first, then comments: a quote inside a comment is not a
 * string, and `--` inside a string is not a comment, so the order is the only one
 * that is right. What is left is declarations, read line by line.
 */
export function contribution(source: string): string[] {
    const code = commentsRemoved(stringsBlanked(source));
    const found = new Set<string>();
    const collect = (raw: string) => splitIdentifier(raw).forEach(w => found.add(w));

    for (const line of code.split('\n')) {
        for (const pattern of PLAYER_FACING.map(ident)) {
            const m = pattern.exec(line);
            if (m) {
                identifiersIn(m[1]).forEach(collect);
            }
        }
        for (const m of line.matchAll(NAME_CLAUSE)) {
            identifiersIn(m[1]).forEach(collect);
        }
        const synonyms = SYNONYMS.exec(line);
        if (synonyms) {
            identifiersIn(synonyms[1]).forEach(collect);
        }
        const exit = EXIT.exec(line);
        if (exit) {
            identifiersIn(exit[1]).forEach(collect);
        }
    }
    return [...found].sort();
}

/**
 * The concordance as cSpell reads it: sorted, deduplicated, and headed by a note
 * saying whose file it is. The header names the glossary, because the one thing an
 * author must not do is add a word here.
 */
export function concordanceText(words: string[]): string {
    return [
        '# Written by Alan IF IDE from this project\'s own declarations.',
        '# It is rewritten whenever the sources change, so edits here are lost.',
        '# Words of your own belong in cspell.json -- your glossary -- where',
        '# "Add to dictionary" puts them, and where nothing rebuilds over them.',
        ...words,
        '',
    ].join('\n');
}

function stringsBlanked(source: string): string {
    let out = source;
    for (const span of stringSpans(source)) {
        out = out.slice(0, span.start)
            + out.slice(span.start, span.end).replace(/[^\n]/g, ' ')
            + out.slice(span.end);
    }
    return out;
}

function commentsRemoved(code: string): string {
    return code.replace(/\/\/\/\/[\s\S]*?\/\/\/\//g, '').replace(/--[^\n]*/g, '');
}

function identifiersIn(text: string): string[] {
    return text.match(new RegExp(IDENT, 'g')) ?? [];
}

/**
 * One declared name becomes the words an author would actually type.
 *
 * <p>Quoted ids lose their quotes, `_` and case boundaries split (`night_stand` is
 * two words, and a checker sees them that way in prose), and anything under three
 * characters goes: it cannot be a misspelling worth catching, and every entry added
 * here is a typo that can never be caught anywhere in the game.
 */
function splitIdentifier(raw: string): string[] {
    const unquoted = raw.startsWith("'") && raw.endsWith("'")
        ? raw.slice(1, -1).replace(/''/g, "'")
        : raw;
    const words: string[] = [];
    for (const part of unquoted.split(/[^A-Za-z0-9À-ɏ']+/)) {
        for (const word of part.match(/[A-ZÀ-Þ]?[a-zß-ɏ]+|[A-ZÀ-Þ]+(?![a-z])/g) ?? []) {
            if (word.length > 2) {
                words.push(word.toLowerCase());
            }
        }
    }
    return words;
}
