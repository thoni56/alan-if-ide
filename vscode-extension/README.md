# Alan IF IDE

Editor tooling for the [Alan interactive-fiction language](https://www.alanif.se/) —
syntax highlighting, navigation, real compiler diagnostics, formatting, and one-click
Play, powered by a language server built with [Xtext](https://www.eclipse.org/Xtext/).

> **Alan IF**, not the [M-industries Alan](https://alan-platform.com/) application
> platform — same name, different language. This extension is for the
> interactive-fiction Alan.

![Alan IF IDE editing a multi-file adventure, with the outline showing instances and their verbs](https://raw.githubusercontent.com/thoni56/alan-if-ide/main/docs/images/alan-if-ide-overview.png)

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

  ![Compiler message on hover, and the Problems panel routing the same warning to six different .i files](https://raw.githubusercontent.com/thoni56/alan-if-ide/main/docs/images/alan-if-ide-error-location.png)
- **Play** (▶) — compile the adventure and launch it in an integrated terminal, from
  the editor title bar, the status bar, or the context menu.

  ![The adventure compiled and running in the integrated terminal](https://raw.githubusercontent.com/thoni56/alan-if-ide/main/docs/images/alan-if-ide-run-in-terminal.png)
- **Format Document** — a structure-aware indenter that takes indentation from real
  block nesting, with optional keyword-case normalization. Multi-line strings move as
  rigid blocks and are never reflowed internally.

  ![Format Document reindenting a file and normalising keyword case](https://raw.githubusercontent.com/thoni56/alan-if-ide/main/docs/images/alan-if-ide-format-document.gif)

The **Alan compiler is the source of truth** for diagnostics; the language server
provides the ergonomics — navigation, outline, and formatting.

## Requirements

**Java is included.** The language server runs on the JVM, but the build for your
platform ships with its own trimmed Java runtime — you do not need to install a JDK.
If you would rather use your own, point `alanif.java.home` at it. (The
platform-neutral build carries no runtime and falls back to `JAVA_HOME` or `java` on
your `PATH`.)

To get diagnostics and Play you also need the Alan toolchain:

| | | |
| --- | --- | --- |
| **`alan`** | the compiler (3.0beta8), for diagnostics and Play | Set `alanif.compiler.path`, or have it on your `PATH`. |
| **`arun`** | the interpreter, for Play | Found next to the compiler, or on `PATH`. |

Without them, editing features still work — diagnostics are simply skipped.

## Settings

| Setting | Purpose |
| --- | --- |
| `alanif.compiler.path` | Path to the Alan compiler (else found automatically). |
| `alanif.arun.path` | Path to `arun` (else next to the compiler, or on `PATH`). |
| `alanif.mainFile` | The `.alan` file to compile and Play (else auto-detected). |
| `alanif.format.keywordCase` | `off` (default) / `lower` / `upper` / `capitalize`. |
| `alanif.java.home` | JDK/JRE 21+ home (else the bundled runtime). |

You should not need to set the paths: leave them empty and the tools are found
automatically. Clearing one always returns to that automatic search.

## Knowing whether it works

While an Alan file is open, the language status bubble (the `{}` beside the
language mode in the status bar) lists what the extension found:

    Compiler 3.0beta8     ~/alan/bin/alan — PATH
    Interpreter 3.0beta8  ~/alan/bin/arun — next to the compiler
    Java 21               from the bundled runtime

If something is missing, a warning appears in the status bar instead — click it,
or run **Alan IF: Check Setup**, to see all three at once and fix any of them.
There is also **Alan IF: Locate Alan Compiler…** to browse for the compiler, and
the same for the interpreter.

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
