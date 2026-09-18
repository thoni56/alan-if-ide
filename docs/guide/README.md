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
| Finding and fixing compiler errors | first draft — content verified, **voice not yet Thomas's** |

Everything else is outline.

The draft section was written on a machine without the writing-style conventions
available, so it is a spike for *what* the section covers, not *how* it reads. The
structure and every factual claim in it were checked against the source and against
a real compiler; the prose is expected to be rewritten.

## Facts established while drafting

Checked against the code and against `alan` 3.0beta9, and worth not re-deriving:

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
- `-encoding` defaults to `iso` in the compiler itself, so an ISO-8859-1 source
  compiles cleanly from the command line. The UTF-8 problem arises from the editor
  being in the loop, not from the compiler refusing the file.
- Diagnostics are routed to files **by basename, case-insensitively** — no path is
  involved. Two files of the same name in different folders therefore receive each
  other's errors.
- Xtext's own "couldn't resolve reference" errors are dropped deliberately, because
  a `.i` fragment cannot resolve its siblings. So with no compiler installed, an
  undefined name produces no diagnostic from either source.

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
3. **"the compiler cannot read them at all"** (UTF-8 bullet) overstates it — see the
   `-encoding iso` default above.
4. **"diagnostics are simply skipped"** without a compiler — syntax errors and the
   ISO-8859-1 check still report; it is only compiler diagnostics that stop.
5. Robert's guide quotes error `301 E` where the current compiler emits `310 E`.
