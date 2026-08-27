/**
 * Building a command line for whichever shell the terminal is actually running.
 *
 * <p>Play used to emit one bash line -- POSIX quoting, `&&` to chain -- with a comment
 * asserting "the integrated terminal here is bash". That is wrong for most of the
 * audience: Windows opens PowerShell by default, where a quoted path at the start of a
 * statement is a STRING rather than a command, so Play failed before it began with
 * "Unexpected token '-encoding'". Reported by an author on Windows; it was never on our
 * radar because every one of us develops on a POSIX shell.
 *
 * <p>Kept free of the vscode module on purpose, so the exact text sent to a terminal
 * can be tested without an editor.
 */
export type Shell = 'posix' | 'powershell' | 'cmd';

/** Classify a shell from its executable path, as reported by the editor. */
export function shellFrom(shellPath: string | undefined, platform: string): Shell {
    const shell = (shellPath || '').toLowerCase();
    if (shell.includes('pwsh') || shell.includes('powershell')) {
        return 'powershell';
    }
    if (shell.endsWith('cmd.exe')) {
        return 'cmd';
    }
    if (shell) {
        return 'posix';   // bash, zsh, fish, sh: all quote and chain alike here
    }
    return platform === 'win32' ? 'powershell' : 'posix';
}

/** Compile, then start the game only if that succeeded -- in this shell's dialect. */
export function playCommand(shell: Shell, compiler: string, main: string,
        interpreter: string, a3c: string): string {
    switch (shell) {
        case 'powershell':
            // `&` is what runs a quoted path; without it PowerShell reads the line as
            // an expression. And `&&` exists only in PowerShell 7 while Windows still
            // ships 5.1, so "only if it worked" goes through $LASTEXITCODE instead.
            return `& ${ps(compiler)} -encoding utf8 ${ps(main)}; `
                + `if ($LASTEXITCODE -eq 0) { & ${ps(interpreter)} ${ps(a3c)} }`;
        case 'cmd':
            return `${dq(compiler)} -encoding utf8 ${dq(main)} `
                + `&& ${dq(interpreter)} ${dq(a3c)}`;
        default:
            return `${sq(compiler)} -encoding utf8 ${sq(main)} `
                + `&& ${sq(interpreter)} ${sq(a3c)}`;
    }
}

/** POSIX single-quote. */
function sq(s: string): string {
    return "'" + s.replace(/'/g, "'\\''") + "'";
}

/** PowerShell single-quote: the escape for a quote is to double it. */
function ps(s: string): string {
    return "'" + s.replace(/'/g, "''") + "'";
}

/** cmd.exe: double quotes, which have no escape -- but a path cannot contain one. */
function dq(s: string): string {
    return '"' + s + '"';
}
