# Alan IF IDE author's guide

Work in progress.
A guide to the Alan IF IDE written for the person writing an adventure, ordered by
what an author does rather than by what the extension has.

It is the successor to Robert DeFord's *Alan IDE Reference Guide* (2018), which
described the Eclipse-RCP AlanIDE. That guide supplied the questions an author
asks; none of its text survives here, because almost all of its procedure was
Eclipse's rather than Alan's.

## Why it lives here

Not in `alan-docs`, for two reasons. The extension releases on its own clock, so a
guide published on the SDK's cadence would lag what it describes. And a VS Code
guide is screenshot-heavy, so it should live where its screenshots can be
regenerated — all seven of the old guide's images are now dead.

## Conventions

The guide follows
[`CONVENTIONS.md`](https://github.com/AlanIF/alan-docs/blob/master/CONVENTIONS.md)
in the `alan-docs` repository: UK English, one sentence per line, and the
letter-casing rules for Alan code shown in prose.

## Planned shape

| Part | Sections |
| --- | --- |
| About this guide | who it is for, which version, Robert's guide as ancestor |
| Getting set up | what you need · installing the extension (marketplace / author profile / VSIX) · pointing it at the compiler · **Check Setup** as the "is it working" page |
| Starting a new game | a folder, not a project — the one real shift from Eclipse · the main `.alan` file, `Start At`, `.i` imports · watching it compile as you type |
| **Finding and fixing compiler errors** | reading an error · the Problems panel · which file is compiled · when silence is the wrong kind |
| Finding your way around | outline · Go to Definition · the verb case (syntax plus the override chain) · Find All References and its scoping |
| Keeping the source tidy | Format Document · Re-wrap String and why strings are special · Toggle Block Comment and Alan's whole-line `////` |
| Spelling your prose | brief / concordance / glossary |
| Playing and testing | Play (▶) · terminal vs WinArun · the test loop |
| Housekeeping | UTF-8 conversion · settings · key bindings, including Alt+Q when Rewrap has taken it |

## Status

| Section | State |
| --- | --- |
| Getting set up | first draft — content verified |
| Finding and fixing compiler errors | first draft — content verified, voice pass done |

Everything else is outline.

*Finding and fixing compiler errors* was written on a machine without the
writing-style conventions available and has since had one voice pass, which also
changed the worked example to `Start At kitchen.` from `Start At l.`, verified
against `alan -ide -encoding utf8` 3.0beta9: `310 E : Identifier 'kitchen' not
defined.` *Getting set up* was written in the intended voice from the start.

Neither section has its screenshots yet.

Both files set `:experimental:` in their header. Without it Asciidoctor renders
`kbd:[Ctrl+Shift+P]` and `menu:File[...]` as literal source text, silently — found
by rendering the two drafts, where every keystroke and menu path in both of them was
coming out raw. `check.sh` renders every section and fails if that happens again.

## Facts established while drafting

Worth not re-deriving.

### Finding and fixing compiler errors

Checked against the code and against `alan` 3.0beta9:

- The compiler is run as `alan -ide -encoding utf8`, which emits one message per
  line as `"file", line 3 68-75: 310 E : Identifier 'nowhere' not defined.` — file,
  line, character range, code, severity letter, message.
- Severity `E`/`F`/`S` become Error, `W` Warning, `I` Information. The IDE does not
  pass `-infos`, so informational messages never arrive.
- Validation, and therefore compilation, runs on every keystroke with no debounce.
  The edited `.alan` file is compiled from the editor buffer; imported `.i` files
  are read from disk, and diagnostics for a dirty `.i` are withheld until it is
  saved.
- The "main file" for diagnostics is the alphabetically first `.alan` file in the
  same directory as the file being validated, chosen per file and non-recursively.
- The IDE passes `-encoding utf8` deliberately, because VS Code's editor convention
  is UTF-8 and the Alan compiler is moving that way too. The bare compiler still
  defaults to `-encoding iso`, so an ISO-8859-1 source compiles cleanly from a
  terminal — but that default is legacy, and nothing in the guide should lean on
  it. Under the IDE such a file genuinely cannot be read, which is what the UTF-8
  conversion command exists to fix.
- Diagnostics are routed to files **by basename, case-insensitively** — no path is
  involved. Two files of the same name in different folders therefore receive each
  other's errors.
- Xtext's own "couldn't resolve reference" errors are dropped deliberately, because
  a `.i` fragment cannot resolve its siblings. So with no compiler installed, an
  undefined name produces no diagnostic from either source.

### Getting set up

Checked against the extension sources at `1981ba5` and `package.json` 0.8.6:

- The compiler is looked for in this order: the `alanif.compiler.path` setting, `alan`
  on `PATH`, then the standard install locations. `arun`: the setting, next to the
  compiler, `PATH`, then the standard locations.
- The standard locations are `C:\Program Files\Alan\bin`, `C:\Alan\bin` and
  `%USERPROFILE%\Alan\bin` on Windows; `/usr/local/bin`, `/opt/alan/bin`, `/usr/bin`,
  `~/alan/bin` and `~/Alan/bin` elsewhere.
- Java is resolved as the `alanif.java.home` setting, the runtime bundled in the VSIX,
  `JAVA_HOME`, then `java` on `PATH`. Minimum 21. A missing Java is the only fault the
  alarm calls severe, because without it there is no language server at all.
- Every candidate is probed by running it with `-version`. **No minimum compiler
  version is enforced** — the version string only confirms that the thing really is an
  Alan tool, and is then shown.
- Check Setup is a quick pick titled "Alan IF — setup", with a row each for Java,
  Compiler, Interpreter and Spell checking, plus Language server only while something is
  wrong with it. Every row is a control; the placeholder counts the rows wanting
  attention.
- The SDK's only official download is **alanif.se**, under *Downloads* (Thomas,
  2026-09-18). Not the GitHub releases: those builds are not sorted out yet, so the
  guide must not send an author there. Neither README carries the address at all.
- Asking for Check Setup undoes an earlier "Don't Show Again" on the startup
  missing-compiler warning, and says so. That is the only way back.
- The `⚠ Alan setup` status bar item is shown only while an Alan file is the active
  editor.

## Where this lives in the code

Line numbers are as of commit `65d5635`; the surrounding comments are the reliable
anchor if they drift.

| Behaviour | Location |
| --- | --- |
| Validation entry, contributors added | `AlanResourceValidator.java:56-75` |
| Runs on every keystroke, no debounce | `AlanLog.java:20-22`, `ValidationGuardTest.java:87` |
| Main compiled from the editor buffer | `AlanResourceValidator.java:359-367`, `:196-197` |
| Dirty `.i` withheld until saved | `AlanResourceValidator.java:199-206` |
| Main-file choice (`.alan` is its own) | `AlanResourceValidator.java:173-180`, `firstAlanIn` `:382-393` |
| Routing by basename | `AlanResourceValidator.java:210-213`, `:395-398` |
| Xtext linking errors dropped | `AlanResourceValidator.java:64-66` |
| Known limitations, stated by the class | `AlanResourceValidator.java:39-48` |
| Invocation `alan -ide -encoding utf8` | `AlanCompilerRunner.java:94-110` |
| Output parse regex | `AlanCompilerRunner.java:49-52` |
| Severity mapping | `AlanCompilerRunner.java:235-241`, `AlanResourceValidator.java:409-415` |
| `alanif.mainFile`, Play only | `vscode-extension/src/play.ts:103-128` |
| What the server is actually told | `vscode-extension/src/client.ts:236-239`, `AlanServerExtension.java:27-29` |
| Missing-compiler surfaces | `vscode-extension/src/extension.ts:111-125`, `src/status.ts:209-224`, `src/toolchain.ts:396-415` |
| Compiler and `arun` discovery order | `toolchain.ts:56-97`, `standardLocations` `:142-159` |
| Version probe, and the absence of a gate | `toolchain.ts:179-245` |
| Java precedence, minimum 21 | `java.ts:44-95`, `MINIMUM_JAVA` `:43` |
| Check Setup rows and their actions | `locate.ts:96-256` |
| Check Setup restores the startup notice | `locate.ts:98-102`, `extension.ts:105-125` |
| The alarm, and when it is visible | `toolchain.ts:419-447`, `status.ts:108-135`, `:319-325` |

The per-directory main-file heuristic is knowingly provisional — the comment at
`AlanResourceValidator.java:173-175` says an explicit main "comes with the project
descriptor later". Worth knowing before the guide describes it as settled.

## Discrepancies found in the READMEs

Not yet fixed — listed here so the guide does not inherit them.

1. **`alanif.mainFile`** is documented in both READMEs as "the `.alan` file to
   compile and Play". It affects Play only; the server is never told about it, so
   diagnostics ignore it entirely.
2. **"it compiles the *main* `.alan` file"** suggests a project-wide main. It is
   per-directory and non-recursive, so a `.i` file in a subfolder with no `.alan`
   beside it gets no compiler diagnostics at all, silently.
3. **"diagnostics are simply skipped"** without a compiler — syntax errors and the
   ISO-8859-1 check still report; it is only compiler diagnostics that stop.
4. Robert's guide quotes error `301 E` where the current compiler emits `310 E`.
5. Both READMEs name the compiler as **3.0beta8**, which reads as a requirement. Nothing
   checks a version: the probe only confirms the tool is Alan, and 3.0beta9 is the
   current SDK.

An earlier version of this list claimed the READMEs overstated the UTF-8 problem,
on the strength of the bare compiler's `-encoding iso` default. That was wrong: the
IDE forces `-encoding utf8` on purpose, so the READMEs describe the situation an
author is actually in. Struck rather than left to be acted on.

## To do

Raised against the first draft, deferred while it is still a spike.

- **The section reads as though compiler errors are the only errors there are.**
  The Problems panel carries three sources: syntax errors from Xtext's incremental
  parser, the compiler's own errors, and spell checking. An author does not see
  them as three systems, so the guide needs a frame that covers all three — either
  a broader section than this one, or an opening that says which is which and
  where each is described.
- Decide whether the per-directory main-file rule is described as current
  behaviour or waits for the project descriptor that the code comment anticipates.
- Two screenshots are marked with `// TODO:` in *Getting set up* — the Extensions view,
  and Check Setup with one row wanting attention.
- **What the guide and the two READMEs should each say.** Deferred until the guide
  is near its final form, when it will be easier to see what is worth saying twice.
  Until then neither README changes. `vscode-extension/README.md` is the
  Marketplace listing and has to sell the extension, so it keeps its own full
  descriptions; the root README is the repo index; the two are kept in sync by
  hand.
