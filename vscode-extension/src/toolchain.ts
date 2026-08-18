import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { spawnSync } from 'child_process';

/** Where a tool was found. Reported to the user so the choice is never magic. */
export type ToolSource =
    | 'the alanif.compiler.path setting'
    | 'a standard install location'
    | 'PATH'
    | 'beside the compiler';

export interface ToolFound {
    ok: true;
    command: string;
    version: string;
    source: ToolSource;
}

export interface ToolMissing {
    ok: false;
    /** Everything that was tried, for a message that says more than "not found". */
    tried: string[];
}

export type ToolResult = ToolFound | ToolMissing;

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
    const candidates: string[] = [];
    if (configured && configured.trim()) {
        candidates.push(configured.trim());
    }
    candidates.push('alan' + EXE);
    candidates.push(...standardLocations('alan'));

    return probeAll(candidates, configured, 'compiler');
}

/**
 * Find arun. It normally sits beside the compiler -- but not always: on macOS the
 * interpreter has historically been a separate download from the SDK, so falling
 * through to PATH and the standard locations is a real case, not paranoia.
 */
export function resolveArun(compiler?: string): ToolResult {
    const candidates: string[] = [];
    if (compiler && (compiler.includes('/') || compiler.includes('\\'))) {
        candidates.push(path.join(path.dirname(compiler), 'arun' + EXE));
    }
    candidates.push('arun' + EXE);
    candidates.push(...standardLocations('arun'));

    return probeAll(candidates, undefined, 'interpreter');
}

function probeAll(candidates: string[], configured: string | undefined, _what: string): ToolResult {
    const tried: string[] = [];
    for (const candidate of candidates) {
        const version = probeVersion(candidate);
        tried.push(candidate);
        if (version !== undefined) {
            return { ok: true, command: candidate, version, source: sourceOf(candidate, configured) };
        }
    }
    return { ok: false, tried };
}

function sourceOf(command: string, configured?: string): ToolSource {
    if (configured && command === configured.trim()) {
        return 'the alanif.compiler.path setting';
    }
    if (!command.includes('/') && !command.includes('\\')) {
        return 'PATH';
    }
    return 'a standard install location';
}

/** Where an Alan toolchain tends to end up when it was not put on PATH. */
function standardLocations(tool: string): string[] {
    const home = os.homedir();
    if (process.platform === 'win32') {
        return [
            path.join('C:', 'Program Files', 'Alan', 'bin', tool + EXE),
            path.join('C:', 'Alan', 'bin', tool + EXE),
            path.join(home, 'Alan', 'bin', tool + EXE),
        ];
    }
    return [
        path.join('/usr', 'local', 'bin', tool),
        path.join('/opt', 'alan', 'bin', tool),
        path.join('/usr', 'bin', tool),
        path.join(home, 'alan', 'bin', tool),
        path.join(home, 'Alan', 'bin', tool),
    ];
}

/**
 * The version string a tool reports, or undefined if it will not run or is not
 * an Alan tool. `alan -version` and `arun -version` both print just the version
 * (e.g. "3.0beta8"), which doubles as the check that this really is Alan and not
 * some unrelated binary that happens to be called alan.
 */
export function probeVersion(command: string): string | undefined {
    // A bare name is looked up on PATH; anything else must exist before we spawn.
    const bare = !command.includes('/') && !command.includes('\\');
    if (!bare && !fs.existsSync(command)) {
        return undefined;
    }

    const result = spawnSync(command, ['-version'], { encoding: 'utf8', timeout: 10000 });
    if (result.error || result.status !== 0) {
        return undefined;
    }

    const out = `${result.stdout || ''}${result.stderr || ''}`.trim();
    const match = /^(\d+\.\d+\S*)/m.exec(out);
    return match ? match[1] : undefined;
}

/** A message that says what is missing, where we looked, and what to do about it. */
export function missingCompilerMessage(missing: ToolMissing): string {
    return 'Alan IF IDE could not find the Alan compiler, so diagnostics and Play ' +
        'are unavailable. Locate it, or set alanif.compiler.path. ' +
        `(Looked in: ${missing.tried.join(', ')})`;
}

export function missingArunMessage(missing: ToolMissing): string {
    return 'Alan IF IDE could not find arun, the Alan interpreter, so Play cannot ' +
        'start the game. It is normally installed beside the compiler. ' +
        `(Looked in: ${missing.tried.join(', ')})`;
}
