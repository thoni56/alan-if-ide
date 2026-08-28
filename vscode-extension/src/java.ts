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
    /**
     * Whether this install carries a Java runtime at all.
     *
     * <p>The platform builds do; the platform-neutral one does not. An author can end
     * up on the neutral build without choosing it -- the six builds are verified
     * independently by the marketplace, and the neutral one is a third the size, so it
     * clears first and is briefly the only thing on offer after a release. Someone who
     * installs in that window is then told to install Java by an extension whose own
     * settings promise a bundled one.
     */
    bundled: boolean;
    /**
     * A runtime that was found but refused to run, and why.
     *
     * <p>Distinct from absent, and the distinction is the whole message: telling
     * someone to install Java when a perfectly good JRE is sitting in the extension
     * with its executable bit stripped sends them to fix the wrong thing.
     */
    blocked?: string;
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
    const hasBundled = fs.existsSync(bundled);
    if (hasBundled) {
        candidates.push({ command: javaBin(bundled), source: 'the bundled runtime' });
    }

    if (process.env.JAVA_HOME) {
        candidates.push({ command: javaBin(process.env.JAVA_HOME), source: 'JAVA_HOME' });
    }

    candidates.push({ command: 'java', source: 'PATH' });

    blocked = undefined;
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
    return { ok: false, tooOld, bundled: hasBundled, blocked };
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
/**
 * Why a runtime we could see would not run, if that is what happened.
 *
 * <p>Set by the probe and read when the answer is assembled -- deliberately not
 * threaded through probeVersion's return, whose whole contract is "a version or
 * nothing" and is called from several places that do not care.
 */
let blocked: string | undefined;

function probeVersion(command: string): number | undefined {
    let result = spawnSync(command, ['-version'], { encoding: 'utf8' });

    if (result.error && command !== 'java' && fs.existsSync(command)) {
        try {
            fs.chmodSync(command, 0o755);
            result = spawnSync(command, ['-version'], { encoding: 'utf8' });
        } catch (e) {
            // A runtime that is PRESENT and merely not executable must not be reported
            // as absent: the remedy for "no Java" is to install one, which this author
            // already has, bundled, three lines above. Keep the reason so the message
            // can name it. Plausible wherever a policy strips the executable bit back.
            blocked = `${command} is present but could not be made executable (${e})`;
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
    const found = missing.tooOld.length > 0
        ? `Alan IF IDE needs Java ${MINIMUM_JAVA} or later, but ${missing.tooOld[0].source} `
            + `provides Java ${missing.tooOld[0].version}.`
        : `Alan IF IDE could not find Java ${MINIMUM_JAVA} or later, which the language `
            + `server needs.`;

    if (missing.blocked) {
        return `${found} ${missing.blocked}. This is usually the executable bit being `
            + `lost, which a security policy can also strip back after we restore it. `
            + `Make it executable, or point alanif.java.home at another JDK or JRE `
            + `${MINIMUM_JAVA}+.`;
    }

    if (!missing.bundled) {
        // The likeliest way to be here, and the one the author cannot diagnose: they
        // have the platform-neutral build, which carries no runtime, and every other
        // message in the extension assumes one is bundled. Lead with the remedy that
        // does not require them to install anything.
        return `${found} This is the platform-neutral build of the extension, which `
            + `carries no Java of its own. Reinstalling it will fetch the build for your `
            + `platform, which does — uninstall Alan IF IDE, then install it again from `
            + `the Extensions view. Otherwise install a JDK or JRE ${MINIMUM_JAVA}+ and `
            + `point alanif.java.home at it.`;
    }
    return `${found} Point alanif.java.home at a newer JDK or JRE, or install one. `
        + `Editing will not work until then.`;
}
