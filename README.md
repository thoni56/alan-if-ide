# Alan IF IDE

Modern editor tooling for the [Alan interactive-fiction language](https://www.alanif.se/) —
a language server (built with [Xtext](https://www.eclipse.org/Xtext/)) plus a
[VS Code](https://code.visualstudio.com/) extension. It is the successor to the
older Eclipse-RCP *AlanIDE*.

> **Alan IF**, not the [M-industries Alan](https://alan-platform.com/) application
> platform — same name, different language. This project is for the interactive-fiction
> Alan (`alan-if.github.io`).

## Features

- **Syntax highlighting** for `.alan` and `.i` files.
- **Document outline** — classes, instances, additions, events, imports, verbs,
  syntax, scripts and synonyms, nested and with distinct icons.
- **Go to Definition** (F12) — across files, for every declaration kind, resolved
  by name (works from the many places Alan references things: `isa`, `locate`,
  `describe`, exits, …).
- **Find All References** (Shift+F12) — by name, across the project.
- **Compiler diagnostics** — the real Alan compiler's errors, in-editor, for a whole
  multi-file adventure (it compiles the *main* and routes each error to its file).
- **Run / Play** (▶) — compile the project and launch the game in an integrated
  terminal.
- **Format Document** — a structure-aware indenter with optional keyword-case
  normalization; never reflows the interior of a string.

Division of labour: the **Alan compiler is the source of truth** for diagnostics;
the language server provides the **ergonomics** (navigation, outline, formatting).

## Requirements

- **Java 21+** — the language server runs on the JVM. (Point `alanif.java.home` at a
  JDK/JRE, or have `java` on your `PATH`.)
- The **Alan compiler** (`alan`, 3.0beta8) — for diagnostics and Play. Set
  `alanif.compiler.path`, or have `alan` on your `PATH`. Without it, editing features
  still work; diagnostics are simply skipped.
- **`arun`** — the Alan interpreter, for Play. Found next to the compiler, or on `PATH`.

## Install

Until it is published to a marketplace, install the packaged extension directly:

1. Download `alan-if-ide-<version>.vsix` from the
   [Releases](https://github.com/thoni56/alan-if-ide/releases) page.
2. In VS Code: **Extensions** view → `…` menu → **Install from VSIX…**, and pick the file.
3. Reload the window.

## Settings

| Setting | Purpose |
| --- | --- |
| `alanif.compiler.path` | Path to the Alan compiler (else `alan` on `PATH`). |
| `alanif.java.home` | JDK/JRE 21+ home (else `java` on `PATH`). |
| `alanif.mainFile` | The `.alan` file to compile and Play (else auto-detected). |
| `alanif.format.keywordCase` | `off` (default) / `lower` / `upper` / `capitalize`. |

## Build from source

A plain Maven-Central build (no Tycho). Needs **JDK 21**, **Maven**, and **Node 18+**.

    ./build.sh                      # builds the server jar + compiles the extension
    ./vscode-extension/package-vsix.sh   # packages the .vsix

`build.sh` runs the Xtext generator (MWE2), builds the language server, stages its jar
into the extension, and compiles the TypeScript. `reload.sh` does all of that and
installs the result into your local VS Code.

## Layout

- `se.alanif.alan/` — the language runtime: grammar (`Alan.xtext`), the generated ANTLR
  parser + EMF model, and hand-written services (validation, scoping, formatting).
- `se.alanif.alan.ide/` — the LSP server and its Alan-specific service overrides
  (navigation, outline, formatting).
- `vscode-extension/` — the VS Code client (thin: launches the server, ships the
  grammar, icon, and Run/Play command).

## Provenance

The Xtext grammar was bootstrapped from the Alan compiler's own grammar
(`alan.pmk`) via `tools/pmk2xtext.py`, then hand-authored from there;
`grammar-baseline/` snapshots the compiler grammar at handoff so later drift can be
audited.

## License

[MIT](LICENSE) © Thomas Nilefalk.
