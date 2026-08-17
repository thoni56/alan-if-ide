# Alan IF IDE

Editor tooling for the [Alan interactive-fiction language](https://www.alanif.se/) —
syntax highlighting, navigation, real compiler diagnostics, formatting, and one-click
Play, powered by a language server built with [Xtext](https://www.eclipse.org/Xtext/).

> **Alan IF**, not the [M-industries Alan](https://alan-platform.com/) application
> platform — same name, different language. This extension is for the
> interactive-fiction Alan.

## Features

- **Syntax highlighting** for `.alan` and `.i` files.
- **Document outline** — classes, instances, additions, events, imports, verbs,
  syntax, scripts and synonyms, nested and with distinct icons.
- **Go to Definition** (`F12`) — across files, for every declaration kind, resolved
  by name. Works from the many places Alan references things: `isa`, `locate`,
  `describe`, exits, and so on.
- **Find All References** (`Shift+F12`) — by name, across the project.
- **Compiler diagnostics** — the real Alan compiler's errors, shown in-editor for a
  whole multi-file adventure. It compiles the *main* file and routes each error back
  to the file it came from, so errors surface in your `.i` imports too.
- **Play** (▶) — compile the adventure and launch it in an integrated terminal, from
  the editor title bar, the status bar, or the context menu.
- **Format Document** — a structure-aware indenter that takes indentation from real
  block nesting, with optional keyword-case normalization. Multi-line strings move as
  rigid blocks and are never reflowed internally.

The **Alan compiler is the source of truth** for diagnostics; the language server
provides the ergonomics — navigation, outline, and formatting.

## Requirements

This extension is a client for a language server that runs on the JVM, and it drives
the real Alan toolchain. You will need:

| | | |
| --- | --- | --- |
| **Java 21+** | required | Runs the language server. Set `alanif.java.home`, or have `java` on your `PATH`. |
| **`alan`** | recommended | The Alan compiler (3.0beta8), for diagnostics and Play. Set `alanif.compiler.path`, or have it on your `PATH`. |
| **`arun`** | recommended | The Alan interpreter, for Play. Found next to the compiler, or on `PATH`. |

Without the compiler, editing features still work — diagnostics are simply skipped.

## Settings

| Setting | Purpose |
| --- | --- |
| `alanif.java.home` | JDK/JRE 21+ home (else `java` on `PATH`). |
| `alanif.compiler.path` | Path to the Alan compiler (else `alan` on `PATH`). |
| `alanif.mainFile` | The `.alan` file to compile and Play (else auto-detected). |
| `alanif.format.keywordCase` | `off` (default) / `lower` / `upper` / `capitalize`. |

## A note on `.i` files

Alan uses `.i` for imported source. That extension is contested — C toolchains claim
it too — so this extension sets a workspace default associating `*.i` with Alan. If
you also edit C `.i` files, override `files.associations` for that workspace.

## Source and issues

Source, build instructions and issue tracker:
[github.com/thoni56/alan-if-ide](https://github.com/thoni56/alan-if-ide).
It is the successor to the older Eclipse-RCP *AlanIDE*.

## License

[MIT](LICENSE) © Thomas Nilefalk.
