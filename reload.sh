#!/usr/bin/env bash
# One-shot dev loop: build -> package -> install into VS Code.
# After it finishes, run "Developer: Reload Window" from the Command Palette
# (Ctrl+Shift+P) in VS Code to activate the freshly-installed extension.
set -e
cd "$(dirname "$0")"

./build.sh

# vsce requires Node 20+. Use the default node when it is new enough, otherwise
# borrow a modern one via volta rather than changing the shell's default.
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
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

echo ">> packaging the extension"
(cd vscode-extension && $RUN npx vsce package)

VER=$(node -p "require('./vscode-extension/package.json').version")
NAME=$(node -p "require('./vscode-extension/package.json').name")
VSIX="vscode-extension/$NAME-$VER.vsix"

echo ">> installing $VSIX into VS Code"
code --install-extension "$VSIX" --force

echo ">> installed. Now run 'Developer: Reload Window' (Ctrl+Shift+P) in VS Code."
