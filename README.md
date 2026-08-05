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

