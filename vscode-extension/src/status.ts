import * as os from 'os';
import {
    ExtensionContext, LanguageStatusItem, LanguageStatusSeverity, StatusBarAlignment,
    ThemeColor, commands, languages, window
} from 'vscode';
import { Environment, getEnvironment, onEnvironmentChanged } from './environment';
import { alarmFor } from './toolchain';
import { legacyFiles, onEncodingChanged } from './convert';
import { MINIMUM_JAVA } from './java';
import { rewrapKeyContested } from './notices';

/**
 * Report the setup state on two surfaces, because they answer different questions.
 *
 * The LANGUAGE STATUS ITEMS (in the bubble beside the language mode) answer "what
 * is my setup?" -- always available, quiet, never in the way. But that popup is
 * narrow and cannot be widened, and our detail lines carry absolute paths, so the
 * text there is deliberately ABBREVIATED; the Check Setup quick pick is where the
 * full, untruncated truth lives.
 *
 * The STATUS BAR ITEM answers "is something wrong?" -- it does not exist at all
 * while everything works, and is coloured and unmissable when it does. VS Code does
 * mark the language bubble when an item has Warning or Error severity, but that
 * indicator is subtle and easy to never notice; a missing compiler means no
 * diagnostics and no Play, which is too big a failure to leave to a small glyph.
 */
const SELECTOR = { language: 'alanif' };

/**
 * A fault that is not a missing tool, and so cannot be discovered by probing.
 *
 * The Environment answers "what can this installation find" by running things. A
 * language server that failed to restart is invisible to that question -- the tools
 * are all present and correct, and the only thing wrong is that the running server
 * was never told. It has to be reported in, and it has to persist: the surfaces here
 * exist precisely because a notification an author dismisses leaves no trace.
 */
let serverProblem: string | undefined;
let refresh: (() => void) | undefined;

/** Report (or, with undefined, clear) a server fault. Safe before activation. */
export function reportServerProblem(problem: string | undefined): void {
    serverProblem = problem;
    refresh?.();
}

/** What is wrong with the server, for surfaces other than the alarm. */
export function serverProblemMessage(): string | undefined {
    return serverProblem;
}

export function createStatusItems(context: ExtensionContext): void {
    // Order in the popup is VS Code's to decide, and it is not creation order as
    // written: with ids java/compiler/arun created in that order, the interpreter
    // came out on top -- consistent both with sorting by id ('arun' < 'compiler' <
    // 'java') and with reverse creation order. So satisfy BOTH: number the ids so
    // they sort into the order we want, and create them in the reverse of it. The
    // ids are never displayed, so the digits cost nothing. Confirmed working, but
    // note that satisfying both rules means we never learned WHICH one applies --
    // deliberately, since the API exposes no ordering control and a future VS Code
    // could change its mind. The Check Setup quick pick is where order is ours.
    const java = languages.createLanguageStatusItem('alanif.status.3-java', SELECTOR);
    java.name = 'Alan IF: Java';

    const arun = languages.createLanguageStatusItem('alanif.status.2-interpreter', SELECTOR);
    arun.name = 'Alan IF: Interpreter';

    const compiler = languages.createLanguageStatusItem('alanif.status.1-compiler', SELECTOR);
    compiler.name = 'Alan IF: Compiler';

    // The way back to an offer the author dismissed, or never managed to read before
    // it faded. Absent entirely once the sources are UTF-8, which is the normal case.
    const encoding = languages.createLanguageStatusItem('alanif.status.0-encoding', SELECTOR);
    encoding.name = 'Alan IF: Encoding';
    const renderEncoding = () => {
        const legacy = legacyFiles();
        if (legacy.length === 0) {
            encoding.text = 'UTF-8';
            encoding.detail = 'all sources';
            encoding.severity = LanguageStatusSeverity.Information;
            encoding.command = undefined;
            return;
        }
        encoding.text = `${legacy.length} file${legacy.length === 1 ? '' : 's'} not UTF-8`;
        encoding.detail = 'the compiler cannot read them';
        encoding.severity = LanguageStatusSeverity.Error;
        encoding.command = {
            command: 'alanif.convertSources', title: 'Convert…'
        };
    };
    renderEncoding();

    // Sits just right of Play, and only while an Alan file is in front.
    const alarm = window.createStatusBarItem(StatusBarAlignment.Left, 99);
    alarm.command = 'alanif.checkToolchain';

    const render = (env: Environment) => {
        // Java: an Error, not a Warning. Without it there is no language server at
        // all, so nothing else in this list can even be true.
        if (env.java.ok) {
            java.text = `Java ${env.java.version}`;
            java.detail = env.java.warning
                ? `alanif.java.home ignored — using ${env.java.source}`
                : `from ${env.java.source}`;
            java.severity = env.java.warning
                ? LanguageStatusSeverity.Warning
                : LanguageStatusSeverity.Information;
            java.command = settingsCommand('alanif.java.home');
        } else {
            const old = env.java.tooOld[0];
            java.text = old ? `Java ${old.version} — too old` : 'Java not found';
            // Say WHICH build this is when it has no runtime of its own: without that,
            // "needs Java 21" contradicts a settings page promising a bundled one.
            java.detail = env.java.bundled
                ? `The language server needs Java ${MINIMUM_JAVA} or later`
                : `Needs Java ${MINIMUM_JAVA}+; this platform-neutral build bundles none`;
            java.severity = LanguageStatusSeverity.Error;
            java.command = settingsCommand('alanif.java.home');
        }

        if (env.compiler.ok) {
            compiler.text = `Compiler ${env.compiler.version}`;
            compiler.detail = env.compiler.warning
                ? `alanif.compiler.path ignored — using ${shortenPath(env.compiler.command)}`
                : where(env.compiler.command, env.compiler.source);
            compiler.severity = env.compiler.warning
                ? LanguageStatusSeverity.Warning
                : LanguageStatusSeverity.Information;
            compiler.command = settingsCommand('alanif.compiler.path');
        } else {
            compiler.text = 'Compiler not found';
            compiler.detail = 'No diagnostics, no Play';
            compiler.severity = LanguageStatusSeverity.Warning;
            compiler.command = { command: 'alanif.locateCompiler', title: 'Locate…' };
        }

        if (env.arun.ok) {
            arun.text = `Interpreter ${env.arun.version}`;
            arun.detail = env.arun.warning
                ? `alanif.arun.path ignored — using ${shortenPath(env.arun.command)}`
                : where(env.arun.command, env.arun.source);
            arun.severity = env.arun.warning
                ? LanguageStatusSeverity.Warning
                : LanguageStatusSeverity.Information;
            arun.command = settingsCommand('alanif.arun.path');
        } else {
            arun.text = 'Interpreter not found';
            arun.detail = 'Play cannot start the game';
            arun.severity = LanguageStatusSeverity.Warning;
            arun.command = { command: 'alanif.locateInterpreter', title: 'Locate…' };
        }

        // Applied mechanically, never decided here: the alarm's whole state comes
        // from one pure function, so there is no path that hides the item while
        // leaving it armed. That was the bug -- see alarmFor.
        const state = alarmFor(env, serverProblem);
        alarm.text = state?.text ?? '';
        alarm.tooltip = state?.tooltip;
        if (!state) {
            alarm.hide();
            return;
        }
        alarm.backgroundColor = new ThemeColor(state.severe
            ? 'statusBarItem.errorBackground'
            : 'statusBarItem.warningBackground');
        showIfAlanIsInFront(alarm);
    };

    render(getEnvironment());
    refresh = () => render(getEnvironment());
    context.subscriptions.push(
        java, compiler, arun, alarm, encoding,
        onEncodingChanged(renderEncoding),
        onEnvironmentChanged(render),
        window.onDidChangeActiveTextEditor(() => {
            if (alarm.text) {
                showIfAlanIsInFront(alarm);
            }
        })
    );
}

/**
 * The Alt+Q clash, on a surface that does not go away.
 *
 * <p>A notification is the wrong shape for this on its own: it hides itself after a
 * moment, and what it is reporting stays true until someone acts on it. So the offer
 * is made twice over -- once as a message, at the moment an author re-wraps something
 * and would most like the key, and permanently here, where it waits to be found by
 * anyone who goes looking for why a key does nothing.
 *
 * <p>Present only while the clash is real and unanswered, which is also why it is
 * created rather than merely hidden: an item with nothing to say should not be in the
 * list at all. Its id sorts it below the setup items, and it is created before them,
 * for the reasons createStatusItems explains.
 */
let rewrapKey: LanguageStatusItem | undefined;

export function createRewrapKeyStatusItem(context: ExtensionContext): void {
    commands.executeCommand('setContext', 'alanif.rewrapKeyContested', rewrapKeyContested());
    if (!rewrapKeyContested()) {
        return;
    }
    rewrapKey = languages.createLanguageStatusItem('alanif.status.4-rewrapkey', SELECTOR);
    rewrapKey.name = 'Alan IF: Re-wrap key';
    rewrapKey.text = 'Alt+Q is bound elsewhere';
    rewrapKey.detail = 'to the Rewrap extension, for all files';
    rewrapKey.severity = LanguageStatusSeverity.Information;
    rewrapKey.command = { command: 'alanif.bindRewrapKey', title: 'Bind it to Re-wrap String' };
    context.subscriptions.push(rewrapKey);
}

/** Once the key is settled, however it was settled, the item has nothing to say. */
export function clearRewrapKeyStatusItem(): void {
    commands.executeCommand('setContext', 'alanif.rewrapKeyContested', false);
    rewrapKey?.dispose();
    rewrapKey = undefined;
}

/**
 * A persistent, always-visible Play affordance: the editor-title icon is easy to
 * miss. Shown only while an Alan file is in front, on the same rule as the setup
 * alarm it sits beside.
 */
export function createPlayStatusItem(context: ExtensionContext): void {
    const play = window.createStatusBarItem(StatusBarAlignment.Left, 100);
    play.command = 'alanif.play';
    play.text = '$(play) Play';
    play.tooltip = 'Compile and play this Alan adventure';
    const update = () => showIfAlanIsInFront(play);
    update();
    context.subscriptions.push(play, window.onDidChangeActiveTextEditor(update));
}

/**
 * Open the Settings UI focused on one setting.
 *
 * This is the deliberate answer to "how do I go back to automatic?": a file dialog
 * can only ever produce an explicit path, so once used it is a one-way door. The
 * settings page offers both directions -- clear the box (or hit the reset gear) to
 * return to automatic discovery, or follow its Browse link to pick a file.
 */
function settingsCommand(id: string) {
    return { command: 'workbench.action.openSettings', title: 'Settings…', arguments: [id] };
}

function showIfAlanIsInFront(item: { show(): void; hide(): void }): void {
    if (window.activeTextEditor?.document.languageId === 'alanif') {
        item.show();
    } else {
        item.hide();
    }
}

/**
 * Where a tool came from, short enough for the language status popup.
 *
 * That popup has a fixed, fairly narrow width, so a full absolute path is simply
 * cut off -- and the end of the path (the folder and the binary) is the part worth
 * keeping, not the beginning. So: home becomes `~`, and anything still too long
 * loses its MIDDLE rather than its tail.
 */
function where(command: string, source: string): string {
    return `${shortenPath(command)} — ${source}`;
}

function shortenPath(command: string): string {
    if (!command.includes('/') && !command.includes('\\')) {
        return command;                       // a bare name found on PATH
    }

    const home = os.homedir();
    const withTilde = command.startsWith(home + '/') || command.startsWith(home + '\\')
        ? '~' + command.slice(home.length)
        : command;
    if (withTilde.length <= 40) {
        return withTilde;
    }

    const parts = withTilde.split(/[/\\]/);
    if (parts.length <= 3) {
        return withTilde;
    }
    const head = parts[0] === '' ? '' : parts[0];
    return `${head}/…/${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

