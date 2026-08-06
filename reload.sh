#!/usr/bin/env bash
# One-shot dev loop: build -> package -> install into VS Code.
# After it finishes, press Ctrl+R (Developer: Reload Window) in VS Code to
# activate the freshly-installed extension.
set -e
cd "$(dirname "$0")"

./build.sh
./vscode-extension/package-vsix.sh

VER=$(node -p "require('./vscode-extension/package.json').version")
VSIX="vscode-extension/alan-ide-$VER.vsix"

echo ">> installing $VSIX into VS Code"
code --install-extension "$VSIX" --force

echo ">> installed. Now press Ctrl+R in VS Code to reload the window."
