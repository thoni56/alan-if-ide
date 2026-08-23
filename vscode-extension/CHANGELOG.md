# Changelog

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
