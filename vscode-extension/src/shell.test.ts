import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { shellFrom, playCommand } from './shell';

/**
 * The command line Play sends to a terminal.
 *
 * <p>Worth pinning because this text runs on machines we do not have: the bug it was
 * written for -- Play never having worked on Windows -- was invisible from a POSIX
 * development machine and was found by an author, not by us. The PowerShell form here
 * was checked against a real powershell.exe 5.1 before shipping.
 */

test('a shell is recognised from the executable the editor reports', () => {
    assert.equal(shellFrom('C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'win32'), 'powershell');
    assert.equal(shellFrom('C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'win32'), 'powershell');
    assert.equal(shellFrom('C:\\WINDOWS\\System32\\cmd.exe', 'win32'), 'cmd');
    assert.equal(shellFrom('/bin/bash', 'linux'), 'posix');
    assert.equal(shellFrom('/usr/bin/zsh', 'darwin'), 'posix');
    // Git Bash on Windows: the PLATFORM would say PowerShell and be wrong, which is
    // why the shell is taken from what the terminal will actually run.
    assert.equal(shellFrom('C:\\Program Files\\Git\\bin\\bash.exe', 'win32'), 'posix');
    // Nothing reported: fall back to what the platform opens by default.
    assert.equal(shellFrom(undefined, 'win32'), 'powershell');
    assert.equal(shellFrom('', 'linux'), 'posix');
});

test('PowerShell invokes the path and chains on the exit code', () => {
    const line = playCommand('powershell',
        'c:\\Alan\\alan.exe', 'game.alan', 'c:\\Alan\\arun.exe', 'game.a3c');
    // `&` is what runs a quoted path; without it PowerShell reads a string expression
    // and dies on the first argument -- the reported "Unexpected token '-encoding'".
    assert.ok(line.startsWith("& 'c:\\Alan\\alan.exe' -encoding utf8 'game.alan'"), line);
    // && is PowerShell 7 syntax and Windows ships 5.1, so it must not appear.
    assert.ok(!line.includes('&&'), line);
    assert.ok(line.includes('if ($LASTEXITCODE -eq 0)'), line);
});

test('cmd.exe keeps && and uses double quotes', () => {
    const line = playCommand('cmd', 'c:\\Alan\\alan.exe', 'game.alan', 'c:\\Alan\\arun.exe', 'game.a3c');
    assert.equal(line,
        '"c:\\Alan\\alan.exe" -encoding utf8 "game.alan" && "c:\\Alan\\arun.exe" "game.a3c"');
});

test('POSIX keeps the shape it always had', () => {
    const line = playCommand('posix', '/usr/local/bin/alan', 'game.alan', '/usr/local/bin/arun', 'game.a3c');
    assert.equal(line,
        "'/usr/local/bin/alan' -encoding utf8 'game.alan' && '/usr/local/bin/arun' 'game.a3c'");
});

test('a quote in a path is escaped the way each shell wants', () => {
    const odd = "/home/o'brien/alan";
    assert.ok(playCommand('posix', odd, 'g.alan', odd, 'g.a3c').includes("'/home/o'\\''brien/alan'"));
    assert.ok(playCommand('powershell', odd, 'g.alan', odd, 'g.a3c').includes("'/home/o''brien/alan'"));
});

test('a space in the path survives, which is where the report came from', () => {
    // The reporter's compiler lived in "Desktop\New Alan IDE Test".
    const spaced = 'c:\\Users\\Robert\\Desktop\\New Alan IDE Test\\alan.exe';
    for (const shell of ['posix', 'powershell', 'cmd'] as const) {
        const line = playCommand(shell, spaced, '00 Wyldkynd Project.alan', spaced, 'g.a3c');
        assert.ok(line.includes('New Alan IDE Test'), shell);
        assert.ok(line.includes('00 Wyldkynd Project.alan'), shell);
    }
});
