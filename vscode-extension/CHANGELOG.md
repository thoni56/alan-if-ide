# Changelog

## Unreleased

- **Spell checking, set up for the way an Alan source is actually written.** The
  compiler is correctly indifferent to a typo in your prose, and the prose is most of
  the game — so a misspelling ships to the player with nothing having warned you. The
  new **Alan IF: Set Up Spell Checking** command configures
  [Code Spell Checker](https://marketplace.visualstudio.com/items?itemName=streetsidesoftware.code-spell-checker)
  in your project's own folder to know three things no general checker can: your prose
  lives in string literals and nowhere else, `$p` and `$n` glue themselves to the word
  that follows and must not be read as part of it, and a word built against `$$` is a
  fragment no dictionary in any language will ever hold.

  It also collects your game's own vocabulary — class and instance names, `Name`
  clauses, synonyms, verbs, exits — into a generated word list, so the words you
  invented are not underlined on every page. That list holds the *correct* spelling,
  which is what makes the wrong one stand out: on the 83-file *Wyldkynd Project* this
  takes the checker from 178 unknown words to 57, and those 57 are almost all genuine —
  `satifsy`, `sidways`, `jewelery`, and `Arrowan` where the character is Aerrowan.

  You are asked which language your prose is written in — English is already part of
  Code Spell Checker, and the other 49 install a dictionary — and shown exactly what
  will be written before anything is. An existing `cspell.json` is merged into, never
  replaced, so the words you have added to your own dictionary stay yours. The word
  list is generated, so it is gitignored and rebuilt by running the command again.
  Misspellings are reported as *Information*: the game will run fine, and you may want
  to know.

## 0.7.11 — 2026-09-01

- **The language server now follows your compiler, instead of the setting that once
  named it.** If the path it was started with stopped being a real file — the SDK moved,
  or was installed after the window was already open, or you opened the same project
  from the other side of a WSL/remote switch, where a Windows path is simply not a file
  — diagnostics went silent and stayed silent. Nothing in your settings had changed, so
  nothing ever told the server to look again, and reloading the window was the only
  cure. It now notices whenever the compiler it can actually find differs from the one
  it is holding — which it checks on every Play and every toolchain check — and restarts
  itself to pick it up.
- **A busy server no longer loses its own restart.** Restarting gave the old server two
  seconds to shut down, which it often cannot manage while it is in the middle of
  compiling your project. Missing that window meant the new server was never started at
  all: no diagnostics, no navigation and no formatting until you reloaded, for a server
  that had in fact stopped cleanly a moment later.
- **And a compiler that fails in a way we cannot read now says so.** One that ran,
  failed, and printed something in an unexpected format used to leave the Problems panel
  empty — which is exactly what a clean project looks like. The Alan IF Language Server
  output now names the exit status and quotes what the compiler actually said, which is
  the whole answer when the cause is a compiler too old for the flags this passes it.

## 0.7.10 — 2026-08-30

- **Go to Definition no longer points at where a declaration used to be.** Once you had
  edited a file — re-wrapping a string, adding a line — navigation into that file kept
  answering from the version it first read, so F12 landed beside the declaration instead
  of on it, highlighting a region of exactly the right length. Every other file stayed
  correct, which made it look like one stubborn file rather than a stale index, and
  reloading the window was the only cure. The project index now re-reads a file once it
  changes — including a change made too quickly for the clock to notice — while a file
  you have open with unsaved edits still answers from your editor and not from the disk.

## 0.7.9 — 2026-08-30

- **Re-wrap String is on `Alt+Q` and in the right-click menu.** It was reachable only
  from the Command Palette, which is the one surface you can only use if you already
  know the feature is there. `Alt+Q` is the fill-paragraph key from Emacs and from the
  Rewrap extension, so it is already in the fingers of anyone who went looking for this.
- **And a lightbulb offers it.** Put the cursor in a string that would come out
  differently and the bulb offers to re-wrap it — the one way in that finds you rather
  than waiting to be found. It appears only when re-wrapping would actually change
  something, because the bulb and the command ask the same question.
- **If another extension has `Alt+Q`, Alan IF IDE says so and offers to settle it.**
  The Rewrap extension binds that key for every language, and VS Code may hand it over
  — after which it does nothing at all in an Alan file, which looks exactly like a
  broken feature here. Now the language status bubble says the key is bound elsewhere,
  and one click binds it to Re-wrap String for Alan files while leaving every other
  language alone.
- **Re-wrapped prose lines up, with the quote hanging in the margin.** Continuation
  lines start one column right of the opening quote, which is where the first line's
  text starts — so the block reads as the paragraph it prints as. Before, a string
  already on its own line got continuation lines a whole level deeper, and one moved
  down off its keyword got its first line one column out of true.
- **The blank line between paragraphs is now genuinely blank**, instead of carrying
  the indent as trailing whitespace that an editor could strip on save.
- **And re-wrapping still cannot change one byte of what your game prints.** All 5261
  strings of a real 83-file project were re-wrapped and compared against what the
  interpreter actually receives, using the rules the Alan SDK's own regression test
  pins down: a space before `$p` or `$n` is swallowed, a space after one is content.
  Not one string differs.

## 0.7.8 — 2026-08-30

- **Re-wrap String now lays your prose out the way the game will print it.** `$p` starts a
  fresh paragraph with a blank line before it and `$n` breaks the line, so the source comes
  to resemble what the player reads. Those two markers are the only structure an Alan string
  really has — where you press Return in the source means nothing to the game.
- **A string that ends up spanning lines is moved onto a line of its own**, indented as the
  block it has become, instead of hanging off the end of `Description` with the statements
  after it indented past your prose.
- **Format Document indents a body one level, not two, when the keyword introducing it sits
  on the header line.** `Does Only "…"` followed by an `If` used to put the `If` a level
  deeper than the string, although both are statements of the same body. Blocks written as
  `Exit … does`, `Container Taking …` and `Verb … does only` were all affected. Format
  Document still changes nothing but indentation.

## 0.7.7 — 2026-08-29

- **Long strings now wrap on screen.** Word wrap is on by default for Alan files, because
  Alan source is prose in a way most languages are not. It is purely visual — nothing in
  your file changes.
- **New command: Re-wrap String.** Re-flows the string your cursor is in, or every string
  a selection touches, to `alanif.format.stringWidth` (default 80). Format Document still
  never reflows a string; this is the explicit way to ask. It is safe to use freely:
  whitespace inside an Alan string is collapsed by the interpreter, which wraps to the
  player's terminal, so how a string is laid out in the source cannot change what the game
  prints. Use `$p` and `$n` for real paragraph and line breaks.
- **When a program cannot be used as the compiler or interpreter, we now say which way it
  failed** — there is nothing at that path, the system refused to start it, it never
  answered, it exited with an error, it ran and printed nothing, or it printed something
  that is not an Alan version. Previously all six arrived as one sentence, in the first
  dialog a new author meets.
- **And the silent one names its likeliest cause.** A windowed interpreter (WinArun) that
  starts and exits without a word has usually not found the Glk DLL that must sit beside
  it — it gives up before it reads its arguments, so from the outside it looks like a
  healthy program with nothing to say. Reported by an author who had copied `WinArun.exe`
  to his project folder and left the DLL behind.

## 0.7.6 — 2026-08-28

- **The setup warning in the status bar no longer lies.** Once it had appeared, hiding
  it did not retire it: the next time you switched to an Alan file it came back, still
  naming a compiler that had since been found — while Check Setup and the language
  status items correctly reported everything in place. Reported from a Mac. It needed a
  history a developer machine never has: a tool missing, and then fixed.
- **A language server that fails to restart says so.** Changing the compiler path
  restarts the server, because that is how the server learns it. If the restart failed,
  nothing said anything — and the surviving server was the one started *without* a
  compiler, so the Problems panel stayed empty for the rest of the session while every
  setup surface reported the compiler correctly found. The status bar and Check Setup
  now show it, with the window reload that fixes it.
- **Validation can no longer fail silently in whole.** Both halves of it were wrapped
  in catches that discarded everything a failure would have reported, leaving a
  Problems panel indistinguishable from a clean project — the same equivalence that hid
  a broken Windows platform for eight releases. They still carry on; they no longer do
  it quietly.
- **Navigation says when it cannot read your project.** Six places where a directory
  that could not be listed, or a file that could not be parsed, silently reduced Go to
  Definition and Find All References to the open file. All six now name the reason and
  what is consequently missing.
- **A bundled Java that is present but not executable is no longer reported as
  missing** — the remedy for that is not to install a runtime you already have.
- **Files that cannot be read are named** rather than dropped from the encoding check,
  where they used to shrink the count and produce "nothing to convert" for a project
  that would not compile.

## 0.7.5 — 2026-08-28

- **A project is its main plus everything `import` reaches — not the files in one folder.**
  An Italian adventure accepted the encoding-conversion offer, saw every file it could see
  converted, and still would not compile: `997 SYSTEM ERROR`. The file that mattered was
  imported from outside the opened folder, so the extension never saw it, and the compiler
  reports the failure against the main at line 0, so its own message could not name it
  either. The offer now follows the import trail the way the compiler does, and names the
  offending file and its directory.
- **Files imported from outside the opened folder are named, not converted.** A shared
  library in another checkout is not this game's to rewrite. The offer lists them and says
  so — including when there is nothing left inside the folder to convert, which is exactly
  the case that used to look like the feature had done nothing at all.
- **Silent failures now say why.** A path that cannot be parsed, a compiler that cannot be
  started, a directory that cannot be listed: each used to return nothing and say nothing,
  and nothing is what a clean project looks like too. Those sites now name the reason in
  the "Alan IF Language Server" output channel — so it stays empty unless something is
  actually wrong. The most useful is for a compiler that is configured but not runnable.
- Windows is now tested on Windows in CI, and publishing depends on it: a release that
  breaks Windows can no longer reach a registry.

## 0.7.4 — 2026-08-27

- **Compiler errors now appear on Windows — they never had.** Not since 0.7.1, and not
  since 0.7.3 either: since diagnostics were first added in 0.2.0. VS Code identifies a
  file as `file:///c:/...`, whose empty authority EMF reads as a network host, handing
  the server back `\\\c:\Users\...` — three leading backslashes. Windows rejects that as
  a path, and the error was swallowed as "no such directory", so validation quietly
  produced nothing. An empty Problems panel was the only symptom.
- **Go to Definition across files works on Windows** for the same reason: it looks for
  the project's other files through the same broken path, found none, and reported no
  definition. A name defined in another file simply had nowhere to be found.
- Every place needing a file on disk now shares one repair, with tests — written as a
  pure function over strings so a Linux CI can assert a Windows-only bug. That it could
  not was why this survived eight releases: the paths our machines produce have no drive
  letter to trip over.

## 0.7.3 — 2026-08-27

- **Compiler errors are back in the Problems panel.** Since 0.7.1 it stayed empty for
  everyone whose Alan compiler is not on the system `PATH` — which is most people on
  Windows, where pointing at the compiler is exactly what the setting is for. The
  extension had stopped telling the server where the compiler was, and nothing said so:
  the server simply looked for `alan` on `PATH`, found none, and reported nothing. It
  survived two releases because on a machine where `alan` *is* on `PATH` the wrong
  behaviour and the right one look identical. Reported by an author on Windows.
- Using the server from another editor: the README's Emacs, Neovim and Helix recipes
  configured it through LSP `initializationOptions`, which the server does not in fact
  read. They now use the environment variables it does read.

## 0.7.2 — 2026-08-26

- **Play now works on Windows.** It was building its command line for bash, so on
  Windows — where the terminal is PowerShell — it failed before starting, with
  `Unexpected token '-encoding'`. Reported by an author on Windows. The command is now
  written for whichever shell the terminal is actually running: PowerShell, `cmd.exe`,
  or a POSIX shell including Git Bash on Windows.

## 0.7.1 — 2026-08-25

- **Now on the Visual Studio Marketplace**, so VS Code can find it by searching the
  Extensions view. No download, no picking a file for your platform, and updates arrive
  on their own. It remains on Open VSX for VSCodium, Gitpod and the rest.
- The author profile therefore works in VS Code too — importing it installs the
  extension along with the settings, which it previously could not do there.
- Where a name is **declared** is now marked differently from where it is used, for
  instances and classes as well as for loop variables and verb parameters. Alan spreads
  one entity across several declaring sites — an `every X` and each `add to every X` —
  and all of them read as declarations.

## 0.7.0 — 2026-08-23

**Navigation that knows what a name means.** Until now every feature matched names by
text, across the whole project. That is right for classes, whose `every X` and
`add to every X` really are parts of one thing — and wrong for everything else.

- **Go to Definition on a loop variable** goes to its `for each`, not to an unrelated
  instance elsewhere that happens to share the name. A nested loop over the same name
  shadows the outer one, as it does when the game runs. `this` goes to the class or
  instance whose body it is in.
- **Find All References agrees with it.** Inside a loop you get that loop's uses;
  outside it, only the global's. Previously the two features contradicted each other.
- **Occurrences under the cursor are highlighted** — the declaration marked differently
  from the uses. This did nothing at all before.
- **Go to Definition on a verb shows what decides its behaviour**: the syntax that says
  how the player phrases it, then each class down the hierarchy that overrides it,
  ending where you are. In a real adventure that is six entries instead of 367 — and in
  the order Alan itself consults them. Find All References still lists every
  implementation, which is the question it answers.
- `current actor` and `current location` no longer jump anywhere. They are decided while
  the game runs, and guessing at an instance that shares the name was worse than saying
  nothing.

## 0.6.0 — 2026-08-23

**Getting the encoding out of the way.** Alan works internally in ISO-8859-1, and its
compiler has to be told which encoding a source file is in. Guessing wrong fails in
two directions, one of which is invisible — and neither told you anything useful.

- **Characters the compiler cannot represent are marked where they are.** A curly
  quote or an ellipsis — which macOS and word processors insert on their own — used to
  abort the compile with an internal error naming a line of C, reported against the
  wrong file, taking every other diagnostic in the project with it. Now each one is
  underlined in place, with the plain-text replacement offered as a Quick Fix.
- **Sources in an older encoding are detected and converted.** If a project's files
  are not UTF-8, the extension says so and offers to convert them. It is lossless, the
  game it builds is identical, and line endings are untouched.
- **An Encoding entry in the language status bubble**, so the offer is never a dead
  end if the notification is dismissed.

Without this, opening an older adventure showed replacement characters in the editor
and reported nothing at all from the compiler.

## 0.5.1 — 2026-08-21

- This changelog now ships with the extension. It existed from 0.5.0 but sat
  outside the packaged directory, so the registry had nothing to show.
- Smaller download: the dependency type declarations and package readmes that
  were being included are not read at runtime and are no longer shipped.

## 0.5.0 — 2026-08-21

**Making the setup state visible.** Editing works without the Alan toolchain, but
diagnostics and Play do not — and until now the only sign of that was a
notification at startup, which fires once and then leaves no trace.

- **Language status items.** While an Alan file is open, the `{}` bubble beside the
  language mode lists the compiler, the interpreter and Java — each with its version
  and where it was found (`PATH`, next to the compiler, a standard install location,
  a setting, or the bundled runtime).
- **A status bar warning** when something is missing. It is absent entirely while
  everything works, and clicks straight through to the setup check.
- **Alan IF: Check Setup** now reports all three components at once instead of
  stopping at the first problem, with every entry actionable.
- **`alanif.arun.path`** and **Alan IF: Locate Alan Interpreter…**, so the
  interpreter can be pointed at the same way the compiler already could.
- **A path setting that does not work is now reported.** Such a setting falls back
  to `PATH` and the usual locations, as before — but silently doing so hid a typo
  especially well, because the tool still worked.
- A tool's action opens its **setting** when it is working and the **file picker**
  when it is not: a file dialog can only produce an explicit path, so on its own it
  is a one-way door with no route back to finding the tool automatically.
- Settings are ordered with the compiler first and `alanif.java.home` last.

Fixed:

- No commands were registered when Java was missing, so the author who most needed
  **Check Setup** was told the command did not exist.
- A tool found next to the compiler was reported as coming from a standard install
  location.
- **Don't Show Again** on the missing-compiler notice could not be undone; running
  **Check Setup** now switches it back on.

## 0.4.0 — 2026-08-19

- The Alan toolchain is found automatically: the `alanif.compiler.path` setting,
  then `PATH`, then the usual install locations for the platform. Candidates are
  verified by running them, not by testing that a file exists.
- **Alan IF: Locate Alan Compiler…** browses for the compiler and remembers it,
  replacing a bare text box that required typing an absolute path correctly.
- The settings form links straight to that picker.
- Screenshots in the README.

## 0.3.0 — 2026-08-17

- **Java is included.** Platform-specific builds ship a trimmed Java runtime, so
  authors no longer need a JDK installed. The platform-neutral build still falls
  back to `alanif.java.home`, `JAVA_HOME`, or `java` on `PATH`.
- Packaged with `vsce`, which fills in the icon, README, license and repository
  link that the previous hand-rolled archive left out.

## 0.2.0 — 2026-08-17

First public release.

- Syntax highlighting for `.alan` and `.i` files.
- Document outline: classes, instances, additions, events, imports, verbs, syntax,
  scripts and synonyms, nested and distinctly iconed.
- Go to Definition and Find All References, across files.
- Compiler diagnostics for a whole multi-file adventure, routed back to the file
  each error came from.
- Run / Play: compile the main and launch the game in an integrated terminal.
- Format Document: a structure-aware indenter with optional keyword-case
  normalization, never reflowing the interior of a string.
