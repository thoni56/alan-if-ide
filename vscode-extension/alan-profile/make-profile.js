// Generate an importable VS Code profile (.code-profile) from settings.json.
// The profile format nests stringified JSON; letting a script do the escaping
// avoids the mistakes of hand-writing it. Run: node make-profile.js
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const settingsText = fs.readFileSync(path.join(dir, 'settings.json'), 'utf8');

// A .code-profile is a JSON object whose parts are themselves stringified JSON.
//
// The profile now names the extension as well as the settings, so importing it
// installs Alan IF IDE from the registry rather than leaving the author in the
// state this profile used to create: Alan settings with no Alan extension, and
// .i files typed as C. That only became possible once we were published --
// before, the extension was a local .vsix with no id to resolve.
//
// No `uuid` alongside the id: that is a Marketplace identifier, and this is
// resolved from Open VSX. The installed-extension records on this machine carry
// the bare id too.
const profile = {
  name: 'Alan IF',
  icon: 'book',
  settings: JSON.stringify({ settings: settingsText }),
  extensions: JSON.stringify([
    {
      identifier: { id: 'alanif.alan-if-ide' },
      displayName: 'Alan IF IDE',
    },
  ]),
};

const out = path.join(dir, 'alanif.code-profile');
fs.writeFileSync(out, JSON.stringify(profile, null, 2) + '\n');
console.log('wrote ' + out);
