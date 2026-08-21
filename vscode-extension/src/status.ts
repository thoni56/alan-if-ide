import * as os from 'os';
import {
    ExtensionContext, LanguageStatusSeverity, StatusBarAlignment, ThemeColor,
    languages, window
} from 'vscode';
import { Environment, getEnvironment, onEnvironmentChanged } from './environment';
import { MINIMUM_JAVA } from './java';

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
            java.detail = `The language server needs Java ${MINIMUM_JAVA} or later`;
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

        const missing = [
            env.java.ok ? undefined : 'Java',
            env.compiler.ok ? undefined : 'the Alan compiler',
            env.arun.ok ? undefined : 'arun',
        ].filter(Boolean) as string[];

        // A setting that was set and then quietly stepped over is a failure too --
        // the tool works, so nothing else would ever mention it.
        const ignored = [
            env.java.ok && env.java.warning ? 'alanif.java.home' : undefined,
            env.compiler.ok && env.compiler.warning ? 'alanif.compiler.path' : undefined,
            env.arun.ok && env.arun.warning ? 'alanif.arun.path' : undefined,
        ].filter(Boolean) as string[];

        if (missing.length === 0 && ignored.length === 0) {
            alarm.hide();
            return;
        }
        alarm.text = `$(warning) Alan setup`;
        alarm.tooltip = [
            missing.length ? `Alan IF cannot find ${list(missing)}.` : '',
            ignored.length ? `Alan IF is ignoring ${list(ignored)}.` : '',
            'Click to fix.',
        ].filter(Boolean).join(' ');
        // Java missing is fatal (no server at all); the tools are degradation.
        // Red only when Java is absent: that is the one failure that leaves no
        // language server at all. Everything else still leaves a working editor.
        alarm.backgroundColor = new ThemeColor(env.java.ok
            ? 'statusBarItem.warningBackground'
            : 'statusBarItem.errorBackground');
        showIfAlanIsInFront(alarm);
    };

    render(getEnvironment());
    context.subscriptions.push(
        java, compiler, arun, alarm,
        onEnvironmentChanged(render),
        window.onDidChangeActiveTextEditor(() => {
            if (alarm.text) {
                showIfAlanIsInFront(alarm);
            }
        })
    );
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

/** "a", "a and b", "a, b and c" -- a tooltip is prose, not a data structure. */
function list(items: string[]): string {
    if (items.length === 1) { return items[0]; }
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
