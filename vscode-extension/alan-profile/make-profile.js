// Generate an importable VS Code profile (.code-profile) from settings.json.
// The profile format nests stringified JSON; letting a script do the escaping
// avoids the mistakes of hand-writing it. Run: node make-profile.js
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const settingsText = fs.readFileSync(path.join(dir, 'settings.json'), 'utf8');

// A .code-profile is a JSON object whose parts are themselves stringified JSON.
// We ship settings only -- the Alan extension is installed separately (it's a
// local .vsix, not on the Marketplace, so we don't reference it here).
const profile = {
  name: 'Alan',
  icon: 'book',
  settings: JSON.stringify({ settings: settingsText }),
};

const out = path.join(dir, 'alan.code-profile');
fs.writeFileSync(out, JSON.stringify(profile, null, 2) + '\n');
console.log('wrote ' + out);
