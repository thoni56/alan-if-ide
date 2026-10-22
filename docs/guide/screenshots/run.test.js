const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { run } = require('./run');

const kitchen = 'The kitchen Isa location.\nEnd The kitchen.\n\nStart At kitchen.\n';

test('a shot ends up as a PNG named after it', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-'));
    await run([{
        name: 'after-play',
        files: { 'game.alan': kitchen },
        steps: [{ open: 'game.alan' }, { play: true }, { snap: true }],
    }], { out });
    const png = fs.readFileSync(path.join(out, 'after-play.png'));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
});
