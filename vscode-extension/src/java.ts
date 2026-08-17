import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';

/** Where a usable `java` was found. Shown to the user so the choice is never magic. */
export type JavaSource = 'the alanif.java.home setting' | 'the bundled runtime' | 'JAVA_HOME' | 'PATH';

export interface JavaFound {
    ok: true;
    command: string;
    version: number;
    source: JavaSource;
    /** Set when we fell back past an explicit setting that did not work. */
    warning?: string;
}

export interface JavaMissing {
    ok: false;
    /** Candidates that exist but are too old, for a precise error message. */
    tooOld: { command: string; version: number; source: JavaSource }[];
}

export const MINIMUM_JAVA = 21;

/**
 * Find a Java >= MINIMUM_JAVA, in precedence order:
 *
 *   1. the alanif.java.home setting  -- an explicit choice always wins
 *   2. the runtime bundled in the VSIX -- what most authors get, and invisible to them
 *   3. JAVA_HOME
 *   4. `java` on PATH
 *
 * Each candidate is probed by actually running it, because a path that exists is not
 * the same as a JVM that runs, and a JVM that runs is not necessarily new enough.
 */
export function resolveJava(extensionPath: string, configuredHome?: string): JavaFound | JavaMissing {
    const candidates: { command: string; source: JavaSource }[] = [];

    if (configuredHome) {
        candidates.push({ command: javaBin(configuredHome), source: 'the alanif.java.home setting' });
    }

    const bundled = path.join(extensionPath, 'jre');
    if (fs.existsSync(bundled)) {
        candidates.push({ command: javaBin(bundled), source: 'the bundled runtime' });
    }

    if (process.env.JAVA_HOME) {
        candidates.push({ command: javaBin(process.env.JAVA_HOME), source: 'JAVA_HOME' });
    }

    candidates.push({ command: 'java', source: 'PATH' });

    const tooOld: { command: string; version: number; source: JavaSource }[] = [];
    for (const candidate of candidates) {
        const version = probeVersion(candidate.command);
        if (version === undefined) {
            continue;                       // not there, or not runnable
        }
        if (version < MINIMUM_JAVA) {
            tooOld.push({ ...candidate, version });
            continue;
        }
        // Falling back is the friendly behaviour, but doing it silently would hide a
        // typo in the user's own setting -- so say that we ignored it.
        const ignoredSetting = configuredHome && candidate.source !== 'the alanif.java.home setting';
        return {
            ok: true, ...candidate, version,
            warning: ignoredSetting
                ? `Alan IF IDE: alanif.java.home (${configuredHome}) is not a usable Java ${MINIMUM_JAVA}+ home, so ${candidate.source} was used instead.`
                : undefined
        };
    }
    return { ok: false, tooOld };
}

function javaBin(home: string): string {
    const exe = process.platform === 'win32' ? 'java.exe' : 'java';
    return path.join(home, 'bin', exe);
}

/**
 * The feature version of a `java` command, or undefined if it will not run.
 *
 * A VSIX is a zip, and the executable bit does not always survive the round trip, so
 * restore it before giving up on a bundled runtime -- otherwise a perfectly good JRE
 * looks like a missing one.
 */
function probeVersion(command: string): number | undefined {
    let result = spawnSync(command, ['-version'], { encoding: 'utf8' });

    if (result.error && command !== 'java' && fs.existsSync(command)) {
        try {
            fs.chmodSync(command, 0o755);
            result = spawnSync(command, ['-version'], { encoding: 'utf8' });
        } catch {
            return undefined;
        }
    }

    if (result.error || result.status !== 0) {
        return undefined;
    }

    // `java -version` writes to stderr: openjdk version "21.0.11" 2026-04-21
    const match = /version "(\d+)(?:[.\-+]|")/.exec(`${result.stderr}${result.stdout}`);
    return match ? parseInt(match[1], 10) : undefined;
}

/** A message that tells the user what is wrong *and* what to do about it. */
export function missingJavaMessage(missing: JavaMissing): string {
    if (missing.tooOld.length > 0) {
        const { source, version } = missing.tooOld[0];
        return `Alan IF IDE needs Java ${MINIMUM_JAVA} or later, but ${source} provides Java ${version}. ` +
            `Point alanif.java.home at a newer JDK/JRE, or install one.`;
    }
    return `Alan IF IDE could not find Java ${MINIMUM_JAVA}+, which the language server needs. ` +
        `Install a JDK/JRE ${MINIMUM_JAVA}+ and set alanif.java.home, or put java on your PATH. ` +
        `Editing will not work until then.`;
}
