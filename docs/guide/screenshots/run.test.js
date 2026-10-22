const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { run } = require('./run');

const kitchen = 'The kitchen Isa location.\nEnd The kitchen.\n\nStart At kitchen.\n';

// One run for all the tests, since each shot starts a VS Code of its own.
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-'));
const workFolders = () => fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('alanif-shot-'));
let leftBefore;
let shots;

before(async () => {
    leftBefore = workFolders();
    shots = await run([{
        name: 'after-play',
        files: { 'game.alan': kitchen },
        steps: [{ open: 'game.alan' }, { play: true }, { snap: true }],
    }], { out });
});

after(() => fs.rmSync(out, { recursive: true, force: true }));

test('a shot ends up as a PNG named after it', () => {
    const png = fs.readFileSync(path.join(out, 'after-play.png'));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
});

test('every picture is taken at the same window size', () => {
    const png = fs.readFileSync(path.join(out, 'after-play.png'));
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1280, 800]);
});

test('the extension is the one built from this tree', () => {
    // Only this tree's Play passes -u, so the Marketplace build cannot pass this.
    // The command line wraps, so the screen rows are joined before matching.
    assert.match(shots[0].terminal.replace(/\n/g, ''), /arun\.exe' -u 'game\.a3c'/);
});

test('a run leaves no work folder behind', () => {
    assert.deepEqual(workFolders().filter(n => !leftBefore.includes(n)), []);
});
