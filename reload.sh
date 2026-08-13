#!/usr/bin/env bash
# One-shot dev loop: build -> package -> install into VS Code.
# After it finishes, run "Developer: Reload Window" from the Command Palette
# (Ctrl+Shift+P) in VS Code to activate the freshly-installed extension.
set -e
cd "$(dirname "$0")"

./build.sh
./vscode-extension/package-vsix.sh

VER=$(node -p "require('./vscode-extension/package.json').version")
NAME=$(node -p "require('./vscode-extension/package.json').name")
VSIX="vscode-extension/$NAME-$VER.vsix"

echo ">> installing $VSIX into VS Code"
code --install-extension "$VSIX" --force

echo ">> installed. Now run 'Developer: Reload Window' (Ctrl+Shift+P) in VS Code."
