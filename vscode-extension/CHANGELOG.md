# Changelog

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
