import * as fs from 'fs';
import * as path from 'path';
import {
    QuickPickItem, QuickPickItemKind, Uri, WorkspaceFolder,
    commands, extensions, window, workspace,
} from 'vscode';
import { readThrough, concordance, writeIfChanged } from './names';
import {
    ALL_LANGUAGES, BUNDLED, CSPELL_EXTENSION, BRIEF_FILE, Language,
    LANGUAGES, CONCORDANCE_FILE, briefFor, languagesFor, gitignoreFor, languageNames,
} from './cspell';

/**
 * "Alan IF: Set Up Spell Checking" -- the one command that turns the feature on.
 *
 * <p>Never at activation, and never silently. This writes files into the AUTHOR'S
 * game folder, which is a manuscript: it asks first, says exactly what it will write,
 * and merges into anything that is already there rather than replacing it.
 *
 * <p>It is also the READ-THROUGH. The concordance is derived from the sources, so a
 * pull, a rename, or an edit made in another editor leaves it drifting; running the
 * command again rebuilds every contribution from nothing. That is why there is no
 * watcher -- drift that a deliberate read-through already cures is not worth a
 * permanent process.
 */
export async function setupSpellChecking(): Promise<void> {
    const folder = targetFolder();
    if (folder === undefined) {
        window.showErrorMessage(
            'Alan IF: open the folder holding your game before setting up spell '
            + 'checking. It is configured per project, in the project\'s own files.');
        return;
    }

    const languages = await pickLanguages();
    if (languages === undefined) {
        return;   // cancelled, and nothing has been written
    }

    // Read through before asking, so the confirmation can say how many names it found
    // rather than promising something it has not looked at yet.
    const unreadable: string[] = [];
    const sources = await workspace.findFiles('**/*.{alan,i}', '**/node_modules/**');
    const contributions = readThrough(sources.map(u => u.fsPath), new Map(), unreadable);
    const list = concordance(contributions);
    const words = list.split('\n').filter(l => l !== '' && !l.startsWith('#')).length;

    const root = folder.uri.fsPath;
    const brief = briefFor(read(path.join(root, BRIEF_FILE)), languages);
    if (!brief.ok) {
        reportUnwritableBrief(brief.reason, path.join(root, BRIEF_FILE));
        return;
    }

    const gitignore = gitignorePath(root);
    const plan = {
        merging: read(path.join(root, BRIEF_FILE)) !== undefined,
        gitignore, words, files: contributions.size, sources: sources.length, unreadable,
    };
    // Modal on purpose, as the encoding offer is: this writes into the author's own
    // folder, and a notification that fades in fifteen seconds is not where a
    // decision about someone's project belongs.
    const go = await window.showInformationMessage(
        `Set up spell checking in ${folder.name}?`,
        { modal: true, detail: describePlan(languages, plan) },
        'Set Up');
    if (go !== 'Set Up') {
        return;
    }

    try {
        fs.writeFileSync(path.join(root, BRIEF_FILE), brief.text, 'utf8');
        writeIfChanged(path.join(root, CONCORDANCE_FILE), list);
    } catch (e) {
        window.showErrorMessage(
            `Alan IF: could not write to ${folder.name}. Check the folder permissions. `
            + `(${e instanceof Error ? e.message : String(e)})`);
        return;
    }
    if (gitignore !== undefined) {
        const updated = gitignoreFor(read(gitignore));
        if (updated !== undefined) {
            try {
                fs.writeFileSync(gitignore, updated, 'utf8');
            } catch {
                // The concordance is written and the feature works; an unwritable
                // .gitignore only means the file may get committed. Not worth an
                // error over, and the summary below is where it would go unread.
            }
        }
    }

    await reportAndOfferInstalls(languages, words, contributions.size);
}

/**
 * The folder the command acts on: the one holding the file being edited, else the
 * first. A multi-root workspace with two games in it would otherwise silently
 * configure whichever happened to be first.
 */
function targetFolder(): WorkspaceFolder | undefined {
    const open = window.activeTextEditor?.document.uri;
    return (open !== undefined ? workspace.getWorkspaceFolder(open) : undefined)
        ?? workspace.workspaceFolders?.[0];
}

interface LanguageItem extends QuickPickItem {
    language: Language;
}

/**
 * Which language the game's prose is written in.
 *
 * <p>English is pre-checked and pinned above the rest under its own heading, because
 * the one thing an author cannot discover from a list of fifty languages is that
 * exactly one of them costs nothing: it is the only dictionary Code Spell Checker
 * already carries. So the common answer is one keypress, and the position on screen
 * is what says why.
 *
 * <p>Several at once is allowed and meant: an Italian game importing an English
 * library needs both, which is the shape of the only two Alan corpora we have.
 */
async function pickLanguages(): Promise<string[] | undefined> {
    const item = (language: Language): LanguageItem => ({
        label: language.name,
        description: `${language.code} — ${availability(language)}`,
        picked: language.code === BUNDLED.code,
        language,
    });
    const separator = (label: string): QuickPickItem =>
        ({ label, kind: QuickPickItemKind.Separator });

    const chosen = await window.showQuickPick<LanguageItem | QuickPickItem>([
        separator('Your game\'s language'),
        item(BUNDLED),
        separator('Add a language'),
        ...LANGUAGES.map(item),
    ], {
        canPickMany: true,
        title: 'Alan IF: Spell checking languages',
        placeHolder: 'The language your game\'s prose is written in',
    });
    if (chosen === undefined) {
        return undefined;
    }
    // Unchecking everything is allowed, and means the default rather than nothing:
    // an empty `language` would leave cSpell checking against no dictionary at all.
    const codes = chosen
        .filter((c): c is LanguageItem => 'language' in c)
        .map(c => c.language.code);
    return codes.length > 0 ? codes : [BUNDLED.code];
}

function availability(language: Language): string {
    if (language.extension === undefined) {
        return 'included with Code Spell Checker';
    }
    return installed(language.extension) ? 'installed' : 'adds a dictionary';
}

function installed(extension: string): boolean {
    return extensions.getExtension(extension) !== undefined;
}

interface Plan {
    merging: boolean;
    gitignore: string | undefined;
    words: number;
    files: number;
    sources: number;
    unreadable: string[];
}

/** Everything that will be written, before any of it is. */
function describePlan(languages: string[], plan: Plan): string {
    const lines = [
        `Language: ${languageNames(languages)}.`,
        '',
        plan.merging
            ? `• Alan's settings will be merged into the ${BRIEF_FILE} already here. `
              + 'Your own words and settings are kept, but comments and formatting in '
              + 'that file are not preserved.'
            : `• ${BRIEF_FILE} will be created, holding the rules that tell the `
              + 'checker where your prose is.',
        plan.words === 0
            ? `• ${CONCORDANCE_FILE} will be created, but no Alan sources were found here `
              + 'yet, so it is empty. Run this again once you have some.'
            : `• ${CONCORDANCE_FILE} will hold ${plan.words} names taken from your `
              + `${plan.files} source file${plan.files === 1 ? '' : 's'}, so nothing `
              + 'in your game\'s own vocabulary is marked as a misspelling. It is '
              + 'generated — run this command again to rebuild it. Words of your own '
              + 'go in cspell.json instead, and are never rebuilt over.',
    ];
    if (plan.gitignore !== undefined) {
        lines.push(`• ${CONCORDANCE_FILE} will be added to .gitignore, since it is rebuilt `
            + 'from your sources rather than written by hand.');
    }
    if (plan.unreadable.length > 0) {
        lines.push(`• ${plan.unreadable.length} file`
            + `${plan.unreadable.length === 1 ? ' could' : 's could'} not be read and `
            + 'will be left out, so names declared in '
            + `${plan.unreadable.length === 1 ? 'it' : 'them'} may be marked as `
            + 'misspellings.');
    }
    lines.push('', 'Nothing else in this folder is changed.');
    return lines.join('\n');
}

/**
 * What was written, and what is still missing.
 *
 * <p>The files are written whether or not Code Spell Checker is installed: they are
 * inert without it and correct the moment it arrives, so a declined install leaves
 * nothing broken and needs no second run. But it does have to be SAID, or the
 * outcome is a command that reports success and underlines nothing.
 */
async function reportAndOfferInstalls(
    languages: string[], words: number, files: number,
): Promise<void> {
    const missing = [
        ...(installed(CSPELL_EXTENSION) ? [] : [{
            name: 'Code Spell Checker', code: '', extension: CSPELL_EXTENSION,
        }]),
        ...languagesFor(languages).filter(
            d => d.extension !== undefined && !installed(d.extension)),
    ];
    const found = words === 0 ? 'no names yet'
        : `${words} of your game's own names from ${files} file${files === 1 ? '' : 's'}`;

    if (missing.length === 0) {
        window.showInformationMessage(
            `Alan IF: spell checking is on, knowing ${found}.`);
        return;
    }
    const list = missing.map(d => d.name).join(', ');
    const choice = await window.showInformationMessage(
        `Alan IF: spell checking is configured, knowing ${found}. Nothing will be `
        + `checked until ${list} ${missing.length === 1 ? 'is' : 'are'} installed.`,
        'Install', 'Not Now');
    if (choice !== 'Install') {
        return;
    }
    for (const d of missing) {
        try {
            await commands.executeCommand(
                'workbench.extensions.installExtension', d.extension);
        } catch {
            // One failure must not withhold the others, and the marketplace page is
            // the better place to find out why -- open it rather than guessing.
            window.showWarningMessage(
                `Alan IF: could not install ${d.name}. Install it from the `
                + 'Extensions view.', 'Open Extensions').then(open => {
                    if (open === 'Open Extensions') {
                        commands.executeCommand('workbench.extensions.search', d.extension!);
                    }
                });
        }
    }
}

/**
 * A brief we will not touch.
 *
 * <p>Refusing is the point. The brief is where the glossary lives, and a file we
 * cannot parse is one we would have to overwrite to write into.
 */
function reportUnwritableBrief(reason: string, file: string): void {
    window.showErrorMessage(
        `Alan IF: ${reason}, so it was left alone and nothing was written. Fix it and `
        + 'run this command again.',
        'Open File').then(open => {
            if (open === 'Open File') {
                window.showTextDocument(Uri.file(file), { preview: false });
            }
        });
}

function read(file: string): string | undefined {
    try {
        return fs.readFileSync(file, 'utf8');
    } catch {
        return undefined;
    }
}

/** The .gitignore to update, or undefined when this project is not a repository. */
function gitignorePath(root: string): string | undefined {
    // Only when there is a repository. Many Alan authors have none at all, and for
    // them "committed or ignored" is not a live question -- it is only one more file
    // in their folder that they did not ask for and do not understand.
    return fs.existsSync(path.join(root, '.git'))
        ? path.join(root, '.gitignore')
        : undefined;
}
