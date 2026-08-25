# Alan IF IDE

Modern editor tooling for the [Alan interactive-fiction language](https://www.alanif.se/) —
a language server (built with [Xtext](https://www.eclipse.org/Xtext/)) plus a
[VS Code](https://code.visualstudio.com/) extension. It is the successor to the
older Eclipse-RCP *AlanIDE*.

> **Alan IF**, not the [M-industries Alan](https://alan-platform.com/) application
> platform — same name, different language. This project is for the interactive-fiction
> Alan (`alan-if.github.io`).

![Alan IF IDE editing a multi-file adventure](https://raw.githubusercontent.com/thoni56/alan-if-ide/main/docs/images/alan-if-ide-overview.png)

## Features

- **Syntax highlighting** for `.alan` and `.i` files.
- **Document outline** — classes, instances, additions, events, imports, verbs,
  syntax, scripts and synonyms, nested and with distinct icons.
- **Go to Definition** (F12) — across files, and aware of what a name means. A loop
  variable resolves to its `for each`, not to an instance elsewhere that shares the
  name; `this` resolves to the enclosing class or instance. Everything else resolves
  by name across the project, which is right for classes and instances because those
  names are global in Alan — and it works from the many places Alan references them:
  `isa`, `locate`, `describe`, exits, and so on.
- **Go to Definition on a verb** shows what decides its behaviour: the `syntax` that
  says how the player phrases it, then the `verb` in each class down the hierarchy
  that overrides it, ending where you are — in Alan's own lookup order, rather than
  every declaration of the name at once.
- **Find All References** (Shift+F12) — scoped the same way, so it agrees with Go to
  Definition: inside a loop you get that loop's uses, outside it the global's. On a
  verb it still lists every implementation, which is the question it answers.
- **Highlighting the name under the cursor**, with the declaration marked apart from
  the uses.
- **Compiler diagnostics** — the real Alan compiler's errors, in-editor, for a whole
  multi-file adventure (it compiles the *main* and routes each error to its file).
- **Run / Play** (▶) — compile the project and launch the game in an integrated
  terminal.
- **Format Document** — a structure-aware indenter with optional keyword-case
  normalization; never reflows the interior of a string.

Division of labour: the **Alan compiler is the source of truth** for diagnostics;
the language server provides the **ergonomics** (navigation, outline, formatting).

## Requirements

- **Java 21+** — the language server runs on the JVM. The platform-specific builds
  bundle a trimmed runtime, so authors need install nothing; the platform-neutral
  build uses `alanif.java.home`, then `JAVA_HOME`, then `java` on your `PATH`.
- The **Alan compiler** (`alan`, 3.0beta8) — for diagnostics and Play. Set
  `alanif.compiler.path`, or have `alan` on your `PATH`. Without it, editing features
  still work; diagnostics are simply skipped.
- **`arun`** — the Alan interpreter, for Play. Found next to the compiler, or on `PATH`.

## Install

**Search for "Alan IF IDE" in the Extensions view and click Install.** That works in
VS Code, and in VSCodium, Gitpod, Cursor or anything else built on Open VSX — the
extension is published to both registries. The build for your platform is chosen
automatically and bundles a Java runtime, so there is nothing else to install.

**Or import the author profile** — [`alanif.code-profile`](https://github.com/thoni56/alan-if-ide/releases/latest)
from the release page. It installs this extension *and* a calmer, prose-oriented editor
set up for writing adventures rather than code: no minimap, no breadcrumbs, word wrap on,
and the enclosing `every X` or `verb Y` kept in view while you scroll. Import it with
**File → Preferences → Profiles → Import Profile…**.

If you would rather install a file directly — for an older version, or a machine without
marketplace access — every release also carries the packaged extensions:

1. Download the `.vsix` for your platform from the
   [Releases](https://github.com/thoni56/alan-if-ide/releases) page, e.g.
   `alan-if-ide-win32-x64-<version>.vsix`. These bundle a Java runtime; the unsuffixed
   `alan-if-ide-<version>.vsix` does not, and expects Java 21+ of your own.
2. Press **Ctrl+Shift+P** (**Cmd+Shift+P** on a Mac), type `vsix`, and choose
   **Extensions: Install from VSIX…**. Then pick the file you downloaded.
3. Reload the window when prompted.

## Settings

| Setting | Purpose |
| --- | --- |
| `alanif.compiler.path` | Path to the Alan compiler (else found automatically). |
| `alanif.arun.path` | Path to `arun` (else next to the compiler, or on `PATH`). |
| `alanif.mainFile` | The `.alan` file to compile and Play (else auto-detected). |
| `alanif.format.keywordCase` | `off` (default) / `lower` / `upper` / `capitalize`. |
| `alanif.java.home` | JDK/JRE 21+ home (else the bundled runtime). |

Every one of these can be left empty; clearing a path setting always returns to
finding the tool automatically. **Alan IF: Check Setup** (Command Palette) reports
what was found and where, and the language status bubble in the status bar shows
the same while an Alan file is open.

## Using the server from another editor

The language server is a plain LSP server — `java -jar alan-lsp.jar`, speaking over
stdio — and knows nothing about VS Code. Configuration arrives as LSP
**initializationOptions**, so any client can supply it in its own idiom:

| key | meaning |
| --- | --- |
| `compilerPath` | Path to the Alan compiler. Omit and the server tries `alan` on `PATH`. |
| `keywordCase` | `off` / `lower` / `upper` / `capitalize` for Format Document. |

The jar is inside any release VSIX (a `.vsix` is a zip) at `extension/server/alan-lsp.jar`,
or `./build.sh` produces it. It needs Java 21+.

Starting points for three clients — **untested by us**, so corrections are welcome:

```elisp
;; Emacs, eglot
(add-to-list 'eglot-server-programs
             '(alan-mode . ("java" "-jar" "/path/to/alan-lsp.jar"
                            :initializationOptions
                            (:compilerPath "/usr/local/bin/alan" :keywordCase "off"))))
```

```lua
-- Neovim 0.11+
vim.lsp.config('alanif', {
  cmd = { 'java', '-jar', '/path/to/alan-lsp.jar' },
  filetypes = { 'alan' },
  init_options = { compilerPath = '/usr/local/bin/alan', keywordCase = 'off' },
})
```

```toml
# Helix, languages.toml
[language-server.alan-if]
command = "java"
args = ["-jar", "/path/to/alan-lsp.jar"]
config = { compilerPath = "/usr/local/bin/alan", keywordCase = "off" }
```

Two things do not travel. **Syntax highlighting** is a TextMate grammar that only VS Code
reads, so other editors need their own until the server offers semantic tokens. And
**Play** is a VS Code command, because only the client can host an interactive terminal —
elsewhere, run `arun` yourself.

## Build from source

A plain Maven-Central build (no Tycho). Needs **JDK 21**, **Maven**, and **Node 20+**
(`vsce`, which packages the extension, requires it).

    ./build.sh                                    # server jar + compiled extension
    cd vscode-extension && npx vsce package       # packages the .vsix

`build.sh` deliberately does not build the bundled Java runtime — the dev loop falls
back to `java` on your `PATH`, so paying for it on every build would be waste. To
produce a platform build the way CI does:

    cd vscode-extension
    ./build-jre.sh                                # jlink a runtime for this machine
    npx vsce package --target linux-x64

`build.sh` runs the Xtext generator (MWE2), builds the language server, stages its jar
into the extension, and compiles the TypeScript. `reload.sh` does all of that, packages
the `.vsix`, and installs it into your local VS Code.

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
