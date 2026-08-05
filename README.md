# AlanIDE on Xtext

An Xtext-based language server for [Alan](https://www.alanif.se/) (interactive
fiction language), delivered as a VS Code extension. A modern successor to the
Eclipse-RCP AlanIDE.

## Provenance

The grammar was bootstrapped from the Alan compiler's own grammar
(`~/Utveckling/alan/compiler/alan.pmk`) via `tools/pmk2xtext.py` in the alan repo.
From here `se.alanif.alan/src/se/alanif/alan/Alan.xtext` is **authored source**.
`grammar-baseline/` snapshots the compiler grammar at handoff so drift can be
audited later (regenerate, diff).

## Layout

- `se.alanif.alan/` — the language runtime: grammar, generated ANTLR parser +
  EMF model, and hand-written Java services (validation, scoping, formatting).
- (next) `se.alanif.alan.ide/` — the LSP server.
- (next) `vscode-extension/` — the thin VS Code client.

## Build

Plain Maven-Central build (no Tycho). Needs JDK 21 + Maven.

    mvn compile     # runs MWE2 (generate) then compiles


## Status: v0 (thin vertical) — WORKING

`.alan` files get **syntax highlighting** (TextMate) + **outline** (LSP
`documentSymbol`, from the EMF model), and the parser **never hangs** on
incomplete input. Verified headlessly (`scratchpad/lsp_test.py`): initialize →
didOpen → documentSymbol returns the declaration outline.

    ./build.sh          # server jar + extension

To try it: open `vscode-extension/` in VS Code and press **F5** (Extension
Development Host), then open a `.alan` file. Needs `java` (21+) on PATH.

Next: formatter, then Alan-compiler diagnostics, then cross-references
(go-to-definition / rename).
