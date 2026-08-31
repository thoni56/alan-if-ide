import {
    ExtensionContext, LanguageStatusItem, LanguageStatusSeverity, StatusBarAlignment,
    ThemeColor, commands, languages, window
} from 'vscode';
import { Environment, getEnvironment, onEnvironmentChanged } from './environment';
import { Alarm, StatusDescription, alarmFor, describeTool } from './toolchain';
import { legacyFiles, onEncodingChanged } from './convert';
import { describeJava } from './java';
import { rewrapKeyBindable, rewrapKeyContested } from './notices';

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

const SEVERITY = {
    info: LanguageStatusSeverity.Information,
    warning: LanguageStatusSeverity.Warning,
    error: LanguageStatusSeverity.Error,
};

/** Put a decision on screen. Applies what it is given and decides nothing itself. */
function apply(item: LanguageStatusItem, description: StatusDescription): void {
    item.text = description.text;
    item.detail = description.detail;
    item.severity = SEVERITY[description.severity];
    item.command = description.command;
}

/**
 * The way back to an offer the author dismissed, or never managed to read before it
 * faded. Absent entirely once the sources are UTF-8, which is the normal case.
 *
 * Its own factory because it answers to a different question from the tool items:
 * they report what this INSTALLATION can find, it reports what this PROJECT contains,
 * and they refresh on different events.
 */
function createEncodingItem(context: ExtensionContext): void {
    const encoding = languages.createLanguageStatusItem('alanif.status.0-encoding', SELECTOR);
    encoding.name = 'Alan IF: Encoding';
    const render = () => {
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
        encoding.command = { command: 'alanif.convertSources', title: 'Convert…' };
    };
    render();
    context.subscriptions.push(encoding, onEncodingChanged(render));
}

/**
 * The alarm: absent while everything works, coloured and unmissable when it does not.
 *
 * Returns the one way to change it. Nothing here decides anything -- alarmFor does,
 * and this applies the whole of its answer, ABSENCE INCLUDED. That is structural
 * rather than careful: hide() does not clear an item's text, and the active-editor
 * subscription re-shows anything WITH text, so an alarm that had ever fired used to
 * come back on the next tab switch, still naming a compiler since found. There is now
 * no way to express "hidden but still armed" -- armed is a variable, not a leftover.
 */
function createAlarmItem(context: ExtensionContext): (alarm: Alarm | undefined) => void {
    const item = window.createStatusBarItem(StatusBarAlignment.Left, 99);
    item.command = 'alanif.checkToolchain';
    let armed = false;

    const show = () => {
        if (armed) {
            showIfAlanIsInFront(item);
        }
    };
    context.subscriptions.push(item, window.onDidChangeActiveTextEditor(show));

    return (alarm: Alarm | undefined) => {
        armed = alarm !== undefined;
        if (!alarm) {
            item.text = '';
            item.tooltip = undefined;
            item.hide();
            return;
        }
        item.text = alarm.text;
        item.tooltip = alarm.tooltip;
        item.backgroundColor = new ThemeColor(alarm.severe
            ? 'statusBarItem.errorBackground'
            : 'statusBarItem.warningBackground');
        show();
    };
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

    createEncodingItem(context);

    const showAlarm = createAlarmItem(context);

    const render = (env: Environment) => {
        apply(java, describeJava(env.java));

        apply(compiler, describeTool(env.compiler, {
            noun: 'Compiler',
            setting: 'alanif.compiler.path',
            lost: 'No diagnostics, no Play',
            locate: 'alanif.locateCompiler',
        }));

        apply(arun, describeTool(env.arun, {
            noun: 'Interpreter',
            setting: 'alanif.arun.path',
            lost: 'Play cannot start the game',
            locate: 'alanif.locateInterpreter',
        }));

        showAlarm(alarmFor(env, serverProblem));
    };

    render(getEnvironment());
    refresh = () => render(getEnvironment());
    context.subscriptions.push(
        java, compiler, arun,
        onEnvironmentChanged(render),
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
    // The command stays in the palette for anyone who COULD need it; only the item,
    // which is the part that nags, waits on the question being unanswered.
    commands.executeCommand('setContext', 'alanif.rewrapKeyBindable', rewrapKeyBindable());
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


function showIfAlanIsInFront(item: { show(): void; hide(): void }): void {
    if (window.activeTextEditor?.document.languageId === 'alanif') {
        item.show();
    } else {
        item.hide();
    }
}
