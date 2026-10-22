// Takes the guide's screenshots by driving the Windows VS Code, one fresh profile per run.
// Each shot names the files its game folder starts with and the steps an author would take.
const { chromium } = require('playwright-core');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const VSCODE = path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code');
const PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(shots, { out, alanBin = process.env.ALAN_BIN }) {
    if (!alanBin) throw new Error('Set ALAN_BIN to the folder holding alan.exe and arun.exe');
    fs.mkdirSync(out, { recursive: true });
    for (const shot of shots) {
        await take(shot, out, alanBin);
    }
}

async function take(shot, out, alanBin) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'alanif-shot-'));
    const profile = profileIn(work, copyTools(work, alanBin));
    const game = gameIn(work, shot.files);
    const code = launch(profile, game);
    let page;
    try {
        page = await workbench();
        for (const step of shot.steps) {
            await perform(page, step, game, path.join(out, shot.name + '.png'));
        }
    } catch (e) {
        // What the window looked like when it went wrong, since nobody was watching it.
        await page?.screenshot({ path: path.join(out, shot.name + '-failed.png') }).catch(() => {});
        throw e;
    } finally {
        code.kill();
        // Its processes hold on to their files for a moment after the kill (EPERM).
        fs.rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    }
}

/** A local copy: the extension does not find a compiler at a \\wsl.localhost path. */
function copyTools(work, alanBin) {
    const tools = path.join(work, 'alan');
    fs.mkdirSync(tools);
    for (const exe of ['alan.exe', 'arun.exe']) {
        fs.copyFileSync(path.join(alanBin, exe), path.join(tools, exe));
    }
    return tools;
}

/** A VS Code profile of its own, with the extension installed and the tools set. */
function profileIn(work, tools) {
    const user = path.join(work, 'user');
    const profile = ['--user-data-dir', user, '--extensions-dir', path.join(work, 'ext')];
    fs.mkdirSync(path.join(user, 'User'), { recursive: true });
    fs.writeFileSync(path.join(user, 'User', 'settings.json'), JSON.stringify({
        'alanif.compiler.path': path.join(tools, 'alan.exe'),
        'alanif.arun.path': path.join(tools, 'arun.exe'),
        'workbench.startupEditor': 'none',
        'workbench.tips.enabled': false,
        'update.mode': 'none',
        'extensions.ignoreRecommendations': true,
        'telemetry.telemetryLevel': 'off',
        'chat.disableAIFeatures': true,
        'security.workspace.trust.enabled': false,
        'window.titleBarStyle': 'custom',
    }, null, 2));
    installExtension(profile);
    return profile;
}

function installExtension(profile) {
    // From its own folder: cmd.exe cannot start in a \\wsl.localhost folder, nor take
    // the space in "Microsoft VS Code" unquoted.
    const installed = spawnSync('cmd.exe', ['/c', 'code.cmd', ...profile,
        '--install-extension', 'alanif.alan-if-ide'], { cwd: path.join(VSCODE, 'bin'), encoding: 'utf8' });
    if (installed.status !== 0) throw new Error('Installing the extension failed: ' + installed.stdout + installed.stderr);
}

function gameIn(work, files) {
    const game = path.join(work, 'game');
    fs.mkdirSync(game);
    for (const [name, text] of Object.entries(files)) {
        fs.writeFileSync(path.join(game, name), text);
    }
    return game;
}

function launch(profile, game) {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    return spawn(path.join(VSCODE, 'Code.exe'), [`--remote-debugging-port=${PORT}`,
        ...profile, '--new-window', game], { env, stdio: 'ignore' });
}

async function workbench() {
    let browser;
    for (let i = 0; i < 60 && !browser; i++) {
        try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); }
        catch { await sleep(1000); }
    }
    if (!browser) throw new Error('VS Code did not open its debugging port');
    for (let i = 0; i < 30; i++) {
        const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('workbench'));
        if (page) {
            await page.waitForSelector('.monaco-workbench', { timeout: 60000 });
            return page;
        }
        await sleep(1000);
    }
    throw new Error('No workbench window');
}

async function perform(page, step, game, png) {
    if (step.open) {
        await page.locator('.explorer-folders-view .monaco-list-row', { hasText: step.open }).click();
        await page.waitForSelector(`.tab:has-text("${step.open}")`, { timeout: 60000 });
        await sleep(15000);   // the language server
    } else if (step.play) {
        await page.click('.editor-actions a[aria-label*="Play"]', { timeout: 30000 });
        await page.waitForSelector('.terminal-wrapper', { timeout: 30000 });
        await sleep(6000);    // the compile and the game
    } else if (step.snap) {
        await page.screenshot({ path: png });
    } else {
        throw new Error('Unknown step ' + JSON.stringify(step));
    }
}

module.exports = { run };
