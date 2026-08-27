#!/usr/bin/env bash
# Build the whole thin vertical: LSP server jar + VS Code extension.
set -e
cd "$(dirname "$0")"
echo ">> building the LSP server (Maven)"
# Tests run here rather than being skipped: they are the navigation rules, they take
# about three seconds, and skipping them is how a regression reaches the editor.
mvn -q -B package
echo ">> staging server jar into the extension"
mkdir -p vscode-extension/server   # may not exist on a fresh checkout (its .jar is gitignored)
cp se.alanif.alan.ide/target/se.alanif.alan.ide-*-ls.jar vscode-extension/server/alan-lsp.jar
echo ">> building the VS Code extension"
cd vscode-extension && npm install --no-fund --no-audit && npm run compile && npm test
echo ">> done. Load the extension with F5 in VS Code, or package a .vsix."
