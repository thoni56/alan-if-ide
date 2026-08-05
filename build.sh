#!/usr/bin/env bash
# Build the whole thin vertical: LSP server jar + VS Code extension.
set -e
cd "$(dirname "$0")"
echo ">> building the LSP server (Maven)"
mvn -q -B -DskipTests package
echo ">> staging server jar into the extension"
cp se.alanif.alan.ide/target/se.alanif.alan.ide-*-ls.jar vscode-extension/server/alan-lsp.jar
echo ">> building the VS Code extension"
cd vscode-extension && npm install --no-fund --no-audit && npm run compile
echo ">> done. Load the extension with F5 in VS Code, or package a .vsix."
