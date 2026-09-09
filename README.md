# Alan IF IDE

Editor tooling for the [Alan interactive-fiction language](https://www.alanif.se/): a
language server built with [Xtext](https://www.eclipse.org/Xtext/), plus a
[VS Code](https://code.visualstudio.com/) extension. It is the successor to the older
Eclipse-RCP *AlanIDE*.

> **Alan IF**, for the interactive-fiction Alan (`alan-if.github.io`). It is not the
> [M-industries Alan](https://alan-platform.com/) application platform — same name,
> different language.

![Alan IF IDE editing a multi-file adventure](https://raw.githubusercontent.com/thoni56/alan-if-ide/main/docs/images/alan-if-ide-overview.png)

## Features

You can easily see, and activate, all `Alan IF IDE` features from the Command
Palette in VS Code. Press Ctrl+Shift+P and type "alan if".

- **Syntax highlighting** for `.alan` and `.i` files.
- **Document outline** with classes, instances, additions, events, imports, verbs,
  syntax, scripts and synonyms, nested and with distinct icons.
- **Go to Definition** (F12) — across files, and aware of what a name means. A loop
  variable resolves to its `for each`, `this` resolves to the enclosing class or
  instance. Everything else resolves by name across the project, and works from
  anywhere they appear - `isa`, `locate`, `describe`, exits, and so on.
- **Go to Definition on a verb** shows what decides its behaviour: the `syntax` that
  says how the player phrases it, and all the `verb` in each class down the hierarchy
  that overrides it, ending where you are.
- **Find All References** (Shift+F12) — will show all occurrences of the item or
  symbol. It is scoped so it agrees with Go to Definition: inside a loop you get all
  uses of that loop variable. Used on a verb this lists _every_ implementation.
- **Highlighting the name under the cursor**, when on a symbol other occurrences in view
  is highlighted with the declaration marked slightly different.
- **Compiler diagnostics** — continuous compilation, using the configured Alan compiler,
  shows any errors and warnings. They will be marked on the error location in the editor
  view, and on a separate *Problems* tab for any, even multi-file, adventure (it
  compiles the *main* `.alan` file and shows each error in the correct file).
- **Play** (▶) compiles the project and launches the game in an integrated terminal, or
  with the interpreter you have configured, like WinArun.
- **Format Document** indents from the real block nesting, and will also normalise
  keyword case if you configure it to. It never reflows the interior of a string as this
  is the authors preference.
- **Re-wrap String** (`Alt+Q`, or right-click), on the other hand, reflows just the
  string your cursor is in, or all strings the current selection touches, to
  `alanif.format.stringWidth`. `$p` and `$n` are laid out as the paragraph and line
  break they print as, so the source starts to look like what the player reads. It might
  be ensuring to known that since the interpreter collapses whitespace inside a string
  and wraps to the player's terminal when the game runs, the source layout of a string
  out cannot change what the game prints.
- **Toggle Block Comment** (`Shift+Alt+A`, or right-click) comments the selected lines
  out, and takes the comment away again. Alan's `////` delimiters are whole lines. The
  opening one has to start in the first column, and the comment ends only at a line of
  slashes and nothing else.
- **Convert Sources to UTF-8**. Alan sources in the older ISO-8859-1 show their accented
  text wrongly when read into the editor, and as the compiler, which will run on the
  editor content, cannot read those characters at all. The extension itself notices the
  encoding error, and offers to repair it.  It is lossless, the game it builds is
  identical. An imported library outside the open folder is reported but never
  rewritten, that is its owner's call. (You can open that folder and do the conversion
  of those files, of course.)
- **Set Up Spell Checking**. The compiler does analyse the prose, the text in your
  strings for typos, and that prose is most of the game. This command configures [Code
  Spell
  Checker](https://marketplace.visualstudio.com/items?itemName=streetsidesoftware.code-spell-checker)
  for Alan in your project's own folder. It checks string literals only, understand `$p`
  and `$n` so they don't false-flag as spelling errors. It also ignores the partial
  words that `$$` can be used to concatenate words from. More over it feeds your game's
  own names into a generated word list so they are not underlined: classes, instances,
  `Name` clauses, synonyms, verbs and exits. This creatly reduces the amount of words in
  you prose that are considered unkown or misspellings.  Select the language your prose
  is written in. Once setup, the names will be re-saved and updated every time you save
  an Alan file, so renaming a character, say, take effect as you work. If something
  changes your files outside the IDE, such as a `git pull`, re-run this command to
  ensure a refresh.

  Three files do the work. The **brief** is `cspell.json`, which tells the checker where
  your prose is and which dictionaries to trust. If this file exists in your project,
  the spell checking is setup. The **concordance** is `alan-concordance.txt`, your
  game's own names, rebuilt from your sources on every save, so never edit it. The
  **glossary** is the one you add to: a word that is genuinely yours, a surname or a
  dialect spelling, goes in with **Add to dictionary**. It lives inside the brief,
  travels with the game, and is never rebuilt over. When a misspelling is indicated,
  choose the lightbulb and pick the option naming the project's own `cspell.json` when
  it offers you three (ignore the others, these belong to the spell checker itself, not
  the IDE's use of it).

**If `Alt+Q` (Re-wrap String) does nothing**: the
[Rewrap](https://marketplace.visualstudio.com/items?itemName=stkb.rewrap) extension has
probably already bound the same key for every type of file, rather than it being bound
to the `Alan IF IDE`. The Rewrap extension does nothing at all with an Alan file — which
might look like this feature is broken. You can always invoke **Re-wrap String** from
the right-click menu and the Command Palette (Ctrl+Shift+P). If `Alt+Q` isn't bound to
**Re-wrap String**, the Alan IF IDE will offer to settle it the first time you re-wrap a
string; say yes and it writes the binding below into your `keybindings.json`. **Alan IF:
Bind Alt+Q to Re-wrap String** does the same thing later, if you dismissed the
offer. You can also do it by hand — a *user* keybinding beats any extension's:

```json
{
    "key": "alt+q",
    "command": "alanif.rewrapString",
    "when": "editorTextFocus && editorLangId == alanif"
}
```

`Alt+Q` in an Alan file will then go to Re-wrap String, and every other type of file
stays with Rewrap.


## Requirements

- **Java 21+**. The language server runs on the JVM. The platform-specific builds bundle
  a trimmed runtime, so an author needs to install nothing. The platform-neutral build
  uses `alanif.java.home`, then `JAVA_HOME`, then `java` on your `PATH`.
- The **Alan compiler** (`alan`, 3.0beta8), for diagnostics and Play. Set
  `alanif.compiler.path`, or have `alan` on your `PATH`. Without it the editing features
  still work, diagnostics are simply skipped.
- **`arun`**, the Alan interpreter, for Play. Found next to the compiler, or on `PATH`.

## Install

**In the Extensions View search for "Alan IF IDE" and click Install.** That works in VS
Code, and in VSCodium, Gitpod, Cursor or anything else built on Open VSX — the extension
is published to both registries. The build for your platform is chosen automatically and
bundles a Java runtime, so there is nothing else to install.

**Or import the author profile** — [`alanif.code-profile`](https://github.com/thoni56/alan-if-ide/releases/latest)
from the release page. It installs this extension *and* a calmer, prose-oriented editor
set up for writing adventures rather than code: no minimap, no breadcrumbs, word wrap on,
and the enclosing `every X` or `verb Y` kept in view while you scroll. Import it with
**File → Preferences → Profiles → Import Profile…**.

If you would rather install a file directly — for an older version, or on a machine
without marketplace access — every release also carries the packaged extensions:

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
| `alanif.format.stringWidth` | Column **Re-wrap String** wraps before (default 80). |
| `alanif.java.home` | JDK/JRE 21+ home (else the bundled runtime). |

Every one of these can be left empty. Clearing a path setting always returns to finding
the tool automatically. **Alan IF: Check Setup** (Command Palette) reports what was found
and where, and whether spell checking is set up in the folder you are working in. That
one is per project rather than per machine, so it is easy to have it in one game and not
in another. The language status bubble in the status bar says the same while an Alan file
is open. **Alan IF: Locate Alan Compiler…** and **Alan IF: Locate Alan Interpreter…**
browse for either one instead of typing a path.

## Using the server from another editor

The language server is a plain LSP server, `java -jar alan-lsp.jar`, speaking over
stdio. It knows nothing about VS Code. You configure it through the **environment of the
process you launch**:

| variable | meaning |
| --- | --- |
| `ALAN_COMPILER` | Path to the Alan compiler. Omit and the server tries `alan` on `PATH`. |
| `ALANIF_KEYWORD_CASE` | `off` / `lower` / `upper` / `capitalize` for Format Document. |

The server also has code to read the same two settings from LSP `initializationOptions`
(`compilerPath`, `keywordCase`), which is the intended channel. That code never runs, so
today the environment is the only thing that configures it.

The jar is inside any release VSIX (a `.vsix` is a zip) at `extension/server/alan-lsp.jar`,
or `./build.sh` produces it. It needs Java 21+.

Starting points for three clients — **untested by us**, so corrections are welcome:

```elisp
;; Emacs, eglot
(setenv "ALAN_COMPILER" "/usr/local/bin/alan")
(add-to-list 'eglot-server-programs
             '(alan-mode . ("java" "-jar" "/path/to/alan-lsp.jar")))
```

```lua
-- Neovim 0.11+
vim.lsp.config('alanif', {
  cmd = { 'java', '-jar', '/path/to/alan-lsp.jar' },
  cmd_env = { ALAN_COMPILER = '/usr/local/bin/alan', ALANIF_KEYWORD_CASE = 'off' },
  filetypes = { 'alan' },
})
```

```toml
# Helix, languages.toml
[language-server.alan-if]
command = "java"
args = ["-jar", "/path/to/alan-lsp.jar"]
environment = { ALAN_COMPILER = "/usr/local/bin/alan", ALANIF_KEYWORD_CASE = "off" }
```

Two things do not travel. **Syntax highlighting** is a TextMate grammar that only VS Code
reads, so other editors need their own until the server offers semantic tokens. And
**Play** is a VS Code command, since only the client can host an interactive terminal.
Elsewhere, run `arun` yourself.

## Build from source

A plain Maven-Central build (no Tycho). Needs **JDK 21**, **Maven**, and **Node 20+**
(`vsce`, which packages the extension, requires it).

    ./build.sh                                    # server jar + compiled extension
    cd vscode-extension && npx vsce package       # packages the .vsix

`build.sh` deliberately does not build the bundled Java runtime. The dev loop falls back
to `java` on your `PATH`, so paying for it on every build would be waste. To produce a
platform build the way CI does:

    cd vscode-extension
    ./build-jre.sh                                # jlink a runtime for this machine
    npx vsce package --target linux-x64

`build.sh` runs the Xtext generator (MWE2), builds the language server, stages its jar
into the extension, and compiles the TypeScript. `reload.sh` does all of that, packages
the `.vsix`, and installs it into your local VS Code.

## Layout

- `se.alanif.alan/` is the language runtime: the grammar (`Alan.xtext`), the generated
  ANTLR parser and EMF model, and hand-written services (validation, scoping,
  formatting).
- `se.alanif.alan.ide/` is the LSP server and its Alan-specific service overrides
  (navigation, outline, formatting).
- `vscode-extension/` is the VS Code client. It is thin: it launches the server and ships
  the grammar, the icon and the Play command.

## Provenance

The Xtext grammar was bootstrapped from the Alan compiler's own grammar (`alan.pmk`)
via `tools/pmk2xtext.py`, then hand-authored from there. `grammar-baseline/` snapshots
the compiler grammar at handoff, so later drift can be audited.

## Acknowledgements

- **AlanIDE**, the Eclipse-RCP one this replaces. It served Alan authors for years, and
  it is where most of what belongs in an Alan IDE was worked out the first time.
- **[Xtext](https://www.eclipse.org/Xtext/)** does the language work: the grammar, the
  generated ANTLR parser and EMF model, and the LSP scaffolding around them.
- **[VS Code](https://code.visualstudio.com/)** and the Language Server Protocol, which
  is also what lets the same server work in other editors.
- **[Eclipse Temurin](https://adoptium.net/)** provides the Java that is trimmed down
  and bundled into each platform build, so nobody has to install it.
- **[Code Spell Checker](https://marketplace.visualstudio.com/items?itemName=streetsidesoftware.code-spell-checker)**
  by Street Side Software does the actual spell checking. **Set Up Spell Checking** only
  tells it where an Alan author's prose is, and what the game calls things.
- **[Open VSX](https://open-vsx.org/)**, so the extension can be installed outside the
  Microsoft marketplace.

And two people. **Robert DeFord** wrote the *Alan IDE Reference Guide* for the old IDE,
and has been the first user of this one, finding bugs and giving feedback. **Tristano
Ajmone** converted the Alan standard library into an Italian one, and converted almost
all the documentation to AsciiDoc.

Much of this was written with **[Claude Code](https://claude.com/claude-code)**, as the
commit log records.

## License

[MIT](LICENSE) © Thomas Nilefalk.
