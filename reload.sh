#!/usr/bin/env bash
# One-shot dev loop: build -> package -> install into VS Code.
# After it finishes, run "Developer: Reload Window" from the Command Palette
# (Ctrl+Shift+P) in VS Code to activate the freshly-installed extension.
set -e
cd "$(dirname "$0")"

./build.sh

# vsce requires Node 20+. Probe it IN vscode-extension: volta pins the version per
# directory (via the "volta" field in its package.json), so the repo root reports
# the system node and would answer for the wrong directory.
NODE_MAJOR=$(cd vscode-extension && node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -ge 20 ]; then
  RUN=""
elif command -v volta >/dev/null 2>&1; then
  echo ">> node $NODE_MAJOR is too old for vsce; using volta's node 22"
  RUN="volta run --node 22 --"
else
  echo "!! vsce needs Node 20+ (found $NODE_MAJOR) and volta is not installed." >&2
  echo "!! Install Node 20+ (e.g. 'volta install node@22') and re-run." >&2
  exit 1
fi

# A leftover jre/ from build-jre.sh gets bundled by vsce, and the extension prefers
# a bundled runtime over PATH -- so the dev loop would silently stop exercising the
# fallback that a normal source build is supposed to use. Say so rather than hide it.
if [ -d vscode-extension/jre ]; then
  echo ">> NOTE: vscode-extension/jre exists ($(du -sh vscode-extension/jre | cut -f1))."
  echo ">>       It will be bundled, and used INSTEAD of java on your PATH."
  echo ">>       Remove it for a lean dev build that tests the PATH fallback."
fi

# A fixed dev name, never the release name: packaging as alan-if-ide-<version>.vsix
# would overwrite the artifact of that version -- which is the very file that was
# published, kept here for reference.
VSIX="vscode-extension/alan-if-ide-dev.vsix"
echo ">> packaging the extension into $VSIX"
(cd vscode-extension && $RUN npx vsce package --out "$(basename "$VSIX")")

echo ">> installing $VSIX into VS Code"
code --install-extension "$VSIX" --force

echo ">> installed. Now run 'Developer: Reload Window' (Ctrl+Shift+P) in VS Code."
