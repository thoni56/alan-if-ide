// Takes the guide's screenshots by driving the Windows VS Code, one fresh profile per run.
// Each shot names the files its game folder starts with and the steps an author would take.
const { chromium } = require('playwright-core');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const VSCODE = path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code');
const PORT = 9333;
const SIZE = { width: 1280, height: 800 };
const TREE = path.resolve(__dirname, '..', '..', '..', 'vscode-extension');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(shots, { out, alanBin = process.env.ALAN_BIN }) {
    if (!alanBin) throw new Error('Set ALAN_BIN to the folder holding alan.exe and arun.exe');
    fs.mkdirSync(out, { recursive: true });
    const taken = [];
    for (const shot of shots) {
        taken.push(await take(shot, out, alanBin));
    }
    return taken;
}

async function take(shot, out, alanBin) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'alanif-shot-'));
    const profile = profileIn(work, copyTools(work, alanBin));
    const game = gameIn(work, shot.files);
    const code = launch(profile, game);
    let page;
    const taken = { name: shot.name };
    try {
        page = await workbench();
        for (const step of shot.steps) {
            Object.assign(taken, await perform(page, step, game, path.join(out, shot.name + '.png')));
        }
        return taken;
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
    const ext = path.join(work, 'ext');
    const profile = ['--user-data-dir', user, '--extensions-dir', ext];
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
        'workbench.colorTheme': 'Default Light Modern',
        'workbench.secondarySideBar.defaultVisibility': 'hidden',
        // Drawn as text rather than on a canvas, so the runner can read what it shows.
        'terminal.integrated.gpuAcceleration': 'off',
    }, null, 2));
    installExtension(profile, ext);
    return profile;
}

/**
 * This tree's build, laid over the Marketplace one for the Java runtime it bundles.
 * Everything a VSIX takes from the tree except node_modules, so compile it first.
 */
function installExtension(profile, ext) {
    // From its own folder: cmd.exe cannot start in a \\wsl.localhost folder, nor take
    // the space in "Microsoft VS Code" unquoted.
    const installed = spawnSync('cmd.exe', ['/c', 'code.cmd', ...profile,
        '--install-extension', 'alanif.alan-if-ide'], { cwd: path.join(VSCODE, 'bin'), encoding: 'utf8' });
    if (installed.status !== 0) throw new Error('Installing the extension failed: ' + installed.stdout + installed.stderr);
    const [folder] = fs.readdirSync(ext).filter(n => n.startsWith('alanif.alan-if-ide-'));
    for (const part of ['out', 'server', 'syntaxes', 'package.json', 'language-configuration.json']) {
        fs.cpSync(path.join(TREE, part), path.join(ext, folder, part), { recursive: true });
    }
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
            await page.setViewportSize(SIZE);
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
        // The breadcrumbs gain a symbol once the language server has read the file.
        await page.locator('.breadcrumbs-control .monaco-breadcrumb-item').nth(1).waitFor({ timeout: 60000 });
    } else if (step.play) {
        await page.click('.editor-actions a[aria-label*="Play"]', { timeout: 30000 });
        await page.waitForSelector('.terminal-wrapper', { timeout: 30000 });
        await until(async () => lastLine(await terminalText(page)) === '>', 'the game\'s prompt');
    } else if (step.snap) {
        await parkMouse(page);
        await page.screenshot({ path: png });
        return {
            terminal: await terminalText(page),
            breadcrumbs: await page.locator('.breadcrumbs-control .monaco-breadcrumb-item').allInnerTexts(),
            hovers: await page.locator('.workbench-hover').count(),
            secondarySideBar: await page.locator('.part.auxiliarybar').isVisible(),
            theme: (await page.locator('.monaco-workbench').getAttribute('class')).split(' ').find(c => c.startsWith('vs')),
        };
    } else {
        throw new Error('Unknown step ' + JSON.stringify(step));
    }
}

/** On an empty stretch of the Status Bar, so no tooltip or hover icons are left showing. */
async function parkMouse(page) {
    await page.mouse.move(SIZE.width / 2, SIZE.height - 5);
    await until(async () => await page.locator('.workbench-hover').count() === 0, 'the tooltips to go');
}

/** Polled from here: VS Code's content security policy refuses waitForFunction's eval. */
async function until(condition, what, timeoutMs = 60000) {
    for (const end = Date.now() + timeoutMs; Date.now() < end; await sleep(250)) {
        if (await condition()) return;
    }
    throw new Error('Gave up waiting for ' + what);
}

function lastLine(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    return lines[lines.length - 1];
}

/** What the active terminal shows, one line per screen row. */
async function terminalText(page) {
    const rows = page.locator('.terminal-wrapper.active .xterm-rows > div');
    return (await rows.allInnerTexts()).join('\n');
}

module.exports = { run };
