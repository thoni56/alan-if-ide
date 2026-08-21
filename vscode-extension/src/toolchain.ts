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
}

export interface ToolMissing {
    ok: false;
    /** Everything that was tried, for a message that says more than "not found". */
    tried: string[];
}

export type ToolResult = ToolFound | ToolMissing;

/** A place worth looking, and what finding it there would mean. */
interface Candidate {
    command: string;
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
    if (configured && configured.trim()) {
        candidates.push({ command: configured.trim(), source: 'the alanif.compiler.path setting' });
    }
    candidates.push({ command: 'alan' + EXE, source: 'PATH' });
    candidates.push(...standardLocations('alan'));

    return probeAll(candidates);
}

/**
 * Find arun. It normally sits next to the compiler -- but not always: on macOS the
 * interpreter has historically been a separate download from the SDK, so an
 * explicit setting, PATH and the standard locations are all real cases.
 */
export function resolveArun(compiler?: string, configured?: string): ToolResult {
    const candidates: Candidate[] = [];
    if (configured && configured.trim()) {
        candidates.push({ command: configured.trim(), source: 'the alanif.arun.path setting' });
    }
    if (compiler && (compiler.includes('/') || compiler.includes('\\'))) {
        candidates.push({
            command: path.join(path.dirname(compiler), 'arun' + EXE),
            source: 'next to the compiler'
        });
    }
    candidates.push({ command: 'arun' + EXE, source: 'PATH' });
    candidates.push(...standardLocations('arun'));

    return probeAll(candidates);
}

/**
 * Each candidate carries its own source rather than having it inferred from the
 * shape of the path afterwards: inference cannot tell "next to the compiler" from
 * "a standard install location", and that distinction is now shown to the user.
 */
function probeAll(candidates: Candidate[]): ToolResult {
    const tried: string[] = [];
    for (const candidate of candidates) {
        const version = probeVersion(candidate.command);
        tried.push(candidate.command);
        if (version !== undefined) {
            return { ok: true, command: candidate.command, version, source: candidate.source };
        }
    }
    return { ok: false, tried };
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
        'start the game. It is normally installed next to the compiler. ' +
        `(Looked in: ${missing.tried.join(', ')})`;
}
