import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { spawnSync } from 'child_process';

/** Where a tool was found. Reported to the user so the choice is never magic. */
export type ToolSource =
    | 'the alanif.compiler.path setting'
    | 'the alanif.arun.path setting'
    | 'a standard install location'
    | 'PATH'
    | 'next to the compiler';

export interface ToolFound {
    ok: true;
    command: string;
    version: string;
    source: ToolSource;
    /** Set when we fell back past an explicit setting that did not work. */
    warning?: string;
}

export interface ToolMissing {
    ok: false;
    /** Everything that was tried, for a message that says more than "not found". */
    tried: string[];
    /** An explicit setting that was tried and did not run either. */
    ignoredSetting?: string;
    /** Why the explicit setting did not work, when there was one. */
    settingFailure?: ProbeFailure;
    settingReason?: string;
}

export type ToolResult = ToolFound | ToolMissing;

/** A place worth looking, and what finding it there would mean. */
interface Candidate {
    command: string;
    source: ToolSource;
}

/** An explicit path the user set, so falling past it can be reported. */
interface ConfiguredSetting {
    value: string;
    setting: string;
    what: string;
    source: ToolSource;
}

const EXE = process.platform === 'win32' ? '.exe' : '';

/**
 * Find the Alan compiler, in precedence order:
 *
 *   1. the alanif.compiler.path setting -- an explicit choice always wins
 *   2. `alan` on PATH
 *   3. the usual install locations for this platform
 *
 * Candidates are probed by RUNNING them, not by testing that a file exists: a
 * path can exist and not be an Alan compiler, and "is it there" is the wrong
 * question when the answer we actually want is "does it work, and which one".
 */
export function resolveCompiler(configured?: string): ToolResult {
    const candidates: Candidate[] = [];
    const setting = settingOf(configured, 'alanif.compiler.path', 'the Alan compiler',
        'the alanif.compiler.path setting');
    if (setting) {
        candidates.push({ command: setting.value, source: setting.source });
    }
    candidates.push({ command: 'alan' + EXE, source: 'PATH' });
    candidates.push(...standardLocations('alan'));

    return probeAll(candidates, setting);
}

/**
 * Find arun. It normally sits next to the compiler -- but not always: on macOS the
 * interpreter has historically been a separate download from the SDK, so an
 * explicit setting, PATH and the standard locations are all real cases.
 */
export function resolveArun(compiler?: string, configured?: string): ToolResult {
    const candidates: Candidate[] = [];
    const setting = settingOf(configured, 'alanif.arun.path', 'the Alan interpreter',
        'the alanif.arun.path setting');
    if (setting) {
        candidates.push({ command: setting.value, source: setting.source });
    }
    if (compiler && (compiler.includes('/') || compiler.includes('\\'))) {
        candidates.push({
            command: path.join(path.dirname(compiler), 'arun' + EXE),
            source: 'next to the compiler'
        });
    }
    candidates.push({ command: 'arun' + EXE, source: 'PATH' });
    candidates.push(...standardLocations('arun'));

    return probeAll(candidates, setting);
}

function settingOf(value: string | undefined, setting: string, what: string,
    source: ToolSource): ConfiguredSetting | undefined {
    const trimmed = value?.trim();
    return trimmed ? { value: trimmed, setting, what, source } : undefined;
}

/**
 * Each candidate carries its own source rather than having it inferred from the
 * shape of the path afterwards: inference cannot tell "next to the compiler" from
 * "a standard install location", and that distinction is now shown to the user.
 */
function probeAll(candidates: Candidate[], setting?: ConfiguredSetting): ToolResult {
    const tried: string[] = [];
    let settingProbe: Probe | undefined;
    for (const candidate of candidates) {
        const probe = probeTool(candidate.command);
        const version = probe.version;
        tried.push(candidate.command);
        if (setting !== undefined && candidate.source === setting.source) {
            settingProbe = probe;   // the author's own choice: its reason is the one they need
        }
        if (version !== undefined) {
            // Falling back is the friendly behaviour, but doing it silently would hide
            // a typo in the user's own setting -- the tool works, so nothing else would
            // ever tell them the path they deliberately set is being ignored.
            const ignored = setting !== undefined && candidate.source !== setting.source;
            return {
                ok: true, command: candidate.command, version, source: candidate.source,
                warning: ignored
                    ? `Alan IF IDE: ${setting.setting} (${setting.value}) does not run as `
                        + `${setting.what}, so ${candidate.command} was used instead `
                        + `(${candidate.source}).`
                    : undefined
            };
        }
    }
    return {
        ok: false, tried, ignoredSetting: setting?.value,
        settingFailure: settingProbe?.failure, settingReason: settingProbe?.reason,
    };
}

/** Where an Alan toolchain tends to end up when it was not put on PATH. */
function standardLocations(tool: string): Candidate[] {
    const home = os.homedir();
    const paths = process.platform === 'win32'
        ? [
            path.join('C:', 'Program Files', 'Alan', 'bin', tool + EXE),
            path.join('C:', 'Alan', 'bin', tool + EXE),
            path.join(home, 'Alan', 'bin', tool + EXE),
        ]
        : [
            path.join('/usr', 'local', 'bin', tool),
            path.join('/opt', 'alan', 'bin', tool),
            path.join('/usr', 'bin', tool),
            path.join(home, 'alan', 'bin', tool),
            path.join(home, 'Alan', 'bin', tool),
        ];
    return paths.map(command => ({ command, source: 'a standard install location' as const }));
}

/** Why a candidate is not the tool we wanted. Distinct causes, distinct advice. */
export type ProbeFailure =
    | 'missing'         // nothing at that path
    | 'unstartable'     // the OS refused to run it
    | 'timeout'         // started and never answered
    | 'failed'          // ran and exited non-zero
    | 'silent'          // ran, exited cleanly, printed nothing
    | 'unrecognised';   // printed something that is not an Alan version

export interface Probe {
    /** The version it reported, when it really is an Alan tool. */
    version?: string;
    failure?: ProbeFailure;
    /** One sentence an author can act on. Absent when the probe succeeded. */
    reason?: string;
}

/**
 * Ask a candidate what version it is.
 *
 * <p>`alan -version` and `arun -version` both print just the version (e.g.
 * "3.0beta8"), which doubles as the check that this really is Alan and not some
 * unrelated binary of the same name.
 *
 * <p>WHY THE FAILURE IS CLASSIFIED rather than collapsed into "no": five very
 * different things were all reported to the author as "that does not run as an Alan
 * interpreter", in the first dialog a new user meets. The one that actually happened
 * -- a Windows Glk build exiting 0 in silence because its Glk DLL is missing or too
 * old, before it ever looks at an argument -- is invisible from the outside and
 * undiagnosable by the person hitting it. Keeping the cause costs nothing and is the
 * difference between a message and a wall.
 */
export function probeTool(command: string, timeoutMs = 10000): Probe {
    // A bare name is looked up on PATH; anything else must exist before we spawn.
    const bare = !command.includes('/') && !command.includes('\\');
    if (!bare && !fs.existsSync(command)) {
        return { failure: 'missing', reason: 'there is no file at that path' };
    }

    const result = spawnSync(command, ['-version'], { encoding: 'utf8', timeout: timeoutMs });

    if (result.error) {
        const failed = result.error as NodeJS.ErrnoException;
        if (failed.code === 'ETIMEDOUT') {
            return {
                failure: 'timeout',
                reason: `it did not answer within ${Math.round(timeoutMs / 1000)} seconds`
                    + ' — a windowed build may be waiting for someone to click something',
            };
        }
        return { failure: 'unstartable', reason: `it could not be started (${failed.message})` };
    }

    const out = `${result.stdout || ''}${result.stderr || ''}`.trim();

    if (result.status !== 0) {
        return {
            failure: 'failed',
            reason: `it exited with status ${result.status}`
                + (out ? ` and said: ${firstLine(out)}` : ' without saying why'),
        };
    }
    if (out === '') {
        // The WinArun case. Worth naming, because "it worked and said nothing" is the
        // one outcome an author cannot tell apart from "it is broken".
        return {
            failure: 'silent',
            reason: 'it ran and exited normally but printed nothing, so it cannot say what '
                + 'it is',
        };
    }

    const match = /^(\d+\.\d+\S*)/m.exec(out);
    if (!match) {
        return {
            failure: 'unrecognised',
            reason: `it printed "${firstLine(out)}", which is not an Alan version`,
        };
    }
    return { version: match[1] };
}

/** The version string a tool reports, or undefined. Kept for callers wanting only that. */
export function probeVersion(command: string): string | undefined {
    return probeTool(command).version;
}

function firstLine(text: string): string {
    const line = text.split('\n')[0].trim();
    return line.length > 80 ? line.slice(0, 77) + '…' : line;
}

/** A message that says what is missing, where we looked, and what to do about it. */
/**
 * The one extra sentence a windowed interpreter has earned.
 *
 * <p>WinArun's WinMain calls InitGlk before it looks at a single argument, and exits 0
 * in silence if that fails -- which is what a missing or too-old Glk DLL beside the
 * executable produces. From the outside that is indistinguishable from a healthy
 * program that simply says nothing, and the author has no way to find out. Naming the
 * one cause that fits turns a wall into a next step.
 */
export function glkHint(failure?: ProbeFailure): string {
    return failure === 'silent'
        ? '. A windowed build (WinArun) does this when the Glk DLL beside it is missing '
            + 'or too old, because it gives up before reading its arguments'
        : '';
}

export function missingCompilerMessage(missing: ToolMissing): string {
    const head = 'Alan IF IDE could not find the Alan compiler, so diagnostics and Play are unavailable.';
    const tail = `(Looked in: ${missing.tried.join(', ')})`;
    if (missing.ignoredSetting) {
        return `${head} alanif.compiler.path (${missing.ignoredSetting}) is not usable — ` +
            `${missing.settingReason ?? 'it does not run as the Alan compiler'} — and ` +
            `nothing else was found. ${tail}`;
    }
    return `${head} Locate it, or set alanif.compiler.path. ${tail}`;
}

export function missingArunMessage(missing: ToolMissing): string {
    const head = 'Alan IF IDE could not find arun, the Alan interpreter, so Play cannot start the game.';
    const tail = `(Looked in: ${missing.tried.join(', ')})`;
    if (missing.ignoredSetting) {
        return `${head} alanif.arun.path (${missing.ignoredSetting}) is not usable — ` +
            `${missing.settingReason ?? 'it does not run as the Alan interpreter'}` +
            `${glkHint(missing.settingFailure)} — and nothing else was found. ${tail}`;
    }
    return `${head} It is normally installed next to the compiler. ${tail}`;
}

/**
 * Whether the setup alarm should be showing, and what it should say.
 *
 * <p>Pure, and in a module that cannot import an editor, for the same reason
 * FilePaths is a pure function over strings: the bug this replaces was invisible
 * on a healthy machine. hide() left the item's TEXT set, and the active-editor
 * subscription re-shows anything with text, so an alarm that had ever fired came
 * back on the next tab switch -- still naming a compiler that had since been found.
 * It needed a history our machines never have: a tool missing, and then fixed.
 *
 * <p>Returning the WHOLE state, absence included, is the point. The caller applies
 * it mechanically instead of deciding what to clear, so "hidden but still armed"
 * has nowhere left to live.
 */
export interface ToolState {
    ok: boolean;
    warning?: string;
}

export interface SetupState {
    java: ToolState;
    compiler: ToolState;
    arun: ToolState;
}

export interface Alarm {
    text: string;
    tooltip: string;
    /** Java missing leaves no language server at all; everything else degrades. */
    severe: boolean;
}

/**
 * Where a tool came from, short enough for the language status popup.
 *
 * That popup has a fixed, fairly narrow width, so a full absolute path is simply
 * cut off -- and the end of the path (the folder and the binary) is the part worth
 * keeping, not the beginning. So: home becomes `~`, and anything still too long
 * loses its MIDDLE rather than its tail.
 */
export function where(command: string, source: string): string {
    return `${shortenPath(command)} — ${source}`;
}

export function shortenPath(command: string): string {
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

/**
 * What one status surface should say about one tool -- decided here, applied by the
 * caller, exactly as alarmFor is. Severity is a NAME rather than VS Code's enum so
 * that this module stays free of the editor and the decision stays unit-testable.
 */
export interface StatusDescription {
    text: string;
    detail: string;
    severity: 'info' | 'warning' | 'error';
    command: { command: string; title: string; arguments?: unknown[] };
}

/**
 * Open the Settings UI focused on one setting.
 *
 * This is the deliberate answer to "how do I go back to automatic?": a file dialog
 * can only ever produce an explicit path, so once used it is a one-way door. The
 * settings page offers both directions -- clear the box (or hit the reset gear) to
 * return to automatic discovery, or follow its Browse link to pick a file.
 */
export function settingsCommand(id: string) {
    return { command: 'workbench.action.openSettings', title: 'Settings…', arguments: [id] };
}

/** The words that distinguish one tool from another; everything else is shared. */
export interface ToolLabels {
    /** How the tool is named to the author, e.g. 'Compiler'. */
    noun: string;
    /** The setting that can point at it explicitly. */
    setting: string;
    /** What stops working without it -- the author's actual question. */
    lost: string;
    /** The command that offers to go and find it. */
    locate: string;
}

/**
 * The compiler and the interpreter are the same story told about two tools: found,
 * or found somewhere other than where you said, or not found at all. Java is NOT --
 * see describeJava -- and keeping them apart is what makes that difference visible.
 */
export function describeTool(tool: ToolResult, labels: ToolLabels): StatusDescription {
    if (!tool.ok) {
        return {
            text: `${labels.noun} not found`,
            detail: labels.lost,
            severity: 'warning',
            command: { command: labels.locate, title: 'Locate…' },
        };
    }
    return {
        text: `${labels.noun} ${tool.version}`,
        // A setting that was set and then stepped over is a failure the author would
        // otherwise never hear about, because the tool works.
        detail: tool.warning
            ? `${labels.setting} ignored — using ${shortenPath(tool.command)}`
            : where(tool.command, tool.source),
        severity: tool.warning ? 'warning' : 'info',
        command: settingsCommand(labels.setting),
    };
}

export function alarmFor(setup: SetupState, serverProblem?: string): Alarm | undefined {
    const missing = [
        setup.java.ok ? undefined : 'Java',
        setup.compiler.ok ? undefined : 'the Alan compiler',
        setup.arun.ok ? undefined : 'arun',
    ].filter(Boolean) as string[];

    // A setting that was set and then quietly stepped over is a failure too -- the
    // tool works, so nothing else would ever mention it.
    const ignored = [
        setup.java.ok && setup.java.warning ? 'alanif.java.home' : undefined,
        setup.compiler.ok && setup.compiler.warning ? 'alanif.compiler.path' : undefined,
        setup.arun.ok && setup.arun.warning ? 'alanif.arun.path' : undefined,
    ].filter(Boolean) as string[];

    if (missing.length === 0 && ignored.length === 0 && !serverProblem) {
        return undefined;
    }
    return {
        text: '$(warning) Alan setup',
        tooltip: [
            missing.length ? `Alan IF cannot find ${list(missing)}.` : '',
            ignored.length ? `Alan IF is ignoring ${list(ignored)}.` : '',
            serverProblem ?? '',
            'Click to fix.',
        ].filter(Boolean).join(' '),
        severe: !setup.java.ok,
    };
}

/**
 * The warnings for settings that were set and then quietly stepped over.
 *
 * <p>Worth saying out loud once at activation, because nothing else ever would: the
 * tool WORKS, so every other surface reports success and the author is left believing
 * the path they deliberately chose is the one in use. alarmFor names the same
 * settings in its tooltip; these are the messages the resolvers wrote, which say why.
 */
export function overriddenPathWarnings(setup: SetupState): string[] {
    return [setup.java, setup.compiler, setup.arun]
        .flatMap(tool => tool.ok && tool.warning ? [tool.warning] : []);
}

/** "a", "a and b", "a, b and c" -- a tooltip is prose, not a data structure. */
function list(items: string[]): string {
    if (items.length === 1) { return items[0]; }
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
