// Takes every shot in shots.js into ../images. Run with Windows node; see the Makefile.
const path = require('node:path');
const { run } = require('./run');

run(require('./shots'), { out: path.join(__dirname, '..', 'images') })
    .then(taken => console.log('Took ' + taken.map(t => t.name).join(', ')))
    .catch(e => { console.error(e); process.exit(1); });
