package se.alanif.alan.validation;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.xtext.diagnostics.Severity;
import org.eclipse.xtext.nodemodel.ICompositeNode;
import org.eclipse.xtext.nodemodel.util.NodeModelUtils;
import org.eclipse.xtext.util.CancelIndicator;
import org.eclipse.xtext.validation.CheckMode;
import org.eclipse.xtext.validation.Issue;
import org.eclipse.xtext.validation.ResourceValidatorImpl;

import se.alanif.alan.compiler.AlanCompilerRunner;
import se.alanif.alan.util.AlanLog;
import se.alanif.alan.util.FilePaths;
import se.alanif.alan.util.ProjectFiles;

/**
 * Extends Xtext's validation with real Alan-compiler diagnostics. We hook the
 * IResourceValidator (which the LSP server calls to produce Issues) rather than a
 * @Check: it is the reliable point, since the parse/link Issues we already see
 * flow through here too.
 *
 * <p>PROJECT-AWARE (v1). Alan splices {@code import 'file'.} at scan time, so an
 * imported {@code .i} can't be compiled alone. For any Alan source we compile the
 * project's MAIN file (the {@code .alan} being edited, else the first {@code .alan}
 * in the directory) and keep the diagnostics whose reported file is the one being
 * validated -- so errors land in the correct file at the correct offset, instead
 * of all piling into the .alan. Limitations of v1: the main is compiled with the
 * live buffer only when it is the file being edited; imports are read from disk
 * (so editing a .i refreshes on save); and errors only appear in files that are
 * open/validated. A single project compile that publishes to every file at once is
 * the next step.
 */
public class AlanResourceValidator extends ResourceValidatorImpl {

    private final AlanCompilerRunner compiler = AlanCompilerRunner.fromConfiguration();

    /** One cached project compile per directory, keyed by the source files' state. */
    private static final Map<Path, ProjectCompile> CACHE = new ConcurrentHashMap<>();

    @Override
    public List<Issue> validate(Resource resource, CheckMode mode, CancelIndicator monitor) {
        List<Issue> issues = new ArrayList<>();
        for (Issue issue : super.validate(resource, mode, monitor)) {
            // Alan resolves names across the whole spliced program. An individual .i
            // fragment can't see classes/instances defined in sibling files, so
            // Xtext's per-file linker emits spurious "Couldn't resolve reference"
            // errors. The Alan compiler is the authority on real undefined references
            // (it splices first), so drop Xtext's linking diagnostics and defer to it.
            if (org.eclipse.xtext.diagnostics.Diagnostic.LINKING_DIAGNOSTIC.equals(issue.getCode())) {
                continue;
            }
            issues.add(issue);
        }
        try {
            // Independent of the compiler: a character above U+00FF is a fact about
            // the text, so it is worth reporting whether or not a toolchain is
            // installed -- and it is the reason a compile would fail if one were.
            issues.addAll(encodingIssues(resource));
        } catch (RuntimeException e) {
            // never let a scan break normal validation
        }
        try {
            issues.addAll(compilerIssues(resource));
        } catch (RuntimeException e) {
            // never let the external tool break normal validation
        }
        return issues;
    }

    /**
     * Report every character the Alan compiler cannot represent, at its exact
     * position.
     *
     * <p>What the compiler gives instead is one error at line 0 of the MAIN reading
     * "SYSTEM ERROR: error converting from UTF-8 ... converter.c:133" -- naming the
     * main even when the character is in an import, and taking every other
     * diagnostic in the project down with it, since the compile is abandoned.
     *
     * <p>This runs on the live buffer rather than the file, so an offending
     * character is marked as it is typed or pasted, before it is ever saved.
     */
    private List<Issue> encodingIssues(Resource resource) {
        List<Issue> result = new ArrayList<>();
        URI uri = resource.getURI();
        if (!isAlanSource(uri) || !uri.isFile()) {
            return result;
        }
        String text = resourceText(resource, FilePaths.of(uri));
        if (text == null) {
            return result;
        }
        List<Latin1Check.Finding> findings = Latin1Check.scan(text);
        if (findings.isEmpty()) {
            return result;
        }
        LineMap lines = new LineMap(text);
        for (Latin1Check.Finding f : findings) {
            Issue.IssueImpl issue = new Issue.IssueImpl();
            issue.setMessage(Latin1Check.message(f.codePoint));
            issue.setSeverity(Severity.ERROR);
            issue.setCode("alanif.encoding.unrepresentable");
            issue.setUriToProblem(uri);
            issue.setOffset(f.offset);
            issue.setLength(f.length);
            int[] start = lines.lineColumn(f.offset);
            int[] end = lines.lineColumn(f.offset + f.length);
            issue.setLineNumber(start[0]);
            issue.setColumn(start[1]);
            issue.setLineNumberEnd(end[0]);
            issue.setColumnEnd(end[1]);
            result.add(issue);
        }
        return result;
    }

    private List<Issue> compilerIssues(Resource resource) {
        List<Issue> result = new ArrayList<>();
        URI uri = resource.getURI();
        if (!compiler.isAvailable()) {
            // The commonest reason an author sees an empty Problems panel, and the one
            // that looks most like "my project is fine". Worth saying out loud.
            AlanLog.warn("No Alan compiler available (looked for '" + compiler.path()
                    + "'), so no compiler diagnostics will be reported. Set "
                    + "alanif.compiler.path, or put the compiler on PATH.");
            return result;
        }
        if (!isAlanSource(uri) || !uri.isFile()) {
            return result;
        }
        Path dir = fileDirOf(uri);
        Path resourceFile = FilePaths.of(uri);
        if (dir == null || resourceFile == null) {
            return result;
        }

        // Resolve the compile unit: a .alan is its own main; a .i defers to the
        // first .alan in the directory (an explicit main comes with the project
        // descriptor later).
        boolean editingMain = "alan".equalsIgnoreCase(uri.fileExtension());
        Path main = editingMain ? resourceFile : firstAlanIn(dir);
        if (main == null) {
            return result;
        }

        // Text of the file we're validating (for offset->line/col) -- from the live
        // buffer if it parsed, else from disk (a .i fragment may not parse alone).
        String resourceText = resourceText(resource, resourceFile);
        if (resourceText == null) {
            return result;
        }

        String resourceName = resourceFile.getFileName().toString();
        LineMap lines = new LineMap(resourceText);

        // The main is compiled from its live buffer (own errors, live). Imports share
        // ONE cached compile of the project, so validating an 80-file workspace runs
        // a single compile instead of one per file.
        List<AlanCompilerRunner.Diagnostic> diags;
        if (main.equals(resourceFile)) {
            diags = compiler.run(resourceText, dir, resourceName);
        } else {
            // The compiler reads imports from DISK (only the main's buffer is live).
            // If this import's buffer differs from disk, the compiler's markers are
            // stale AND would mis-place against the edited text, so show none until
            // it's saved. Xtext's own syntax errors keep updating live meanwhile.
            String disk = readFile(resourceFile);
            if (disk == null || !disk.equals(resourceText)) {
                return result;
            }
            diags = projectDiagnostics(dir, main);
        }
        boolean scannedClean = Latin1Check.scan(resourceText).isEmpty();
        for (AlanCompilerRunner.Diagnostic d : diags) {
            if (!resourceName.equalsIgnoreCase(baseName(d.file))) {
                continue; // an error in some other file; it belongs to that document
            }
            String message = d.message;
            if (isConversionFailure(d)) {
                // The compiler's own words here are "SYSTEM ERROR: error converting
                // from UTF-8 in 'readWithConversionFromUtf8()', converter.c:133", at
                // line 0 -- a C source location, which tells an author nothing.
                if (!scannedClean) {
                    continue;   // we are already marking the exact characters
                }
                // The compiler blames the main whatever file it was actually reading,
                // and at line 0, so its message cannot say which file is at fault --
                // which is the only thing the author needs. Work it out ourselves by
                // following the imports and testing each file, because a project is
                // its main plus everything Import reaches, and that routinely lives
                // outside the folder the author has open.
                message = conversionFailureMessage(main);
            }
            Issue.IssueImpl issue = new Issue.IssueImpl();
            issue.setMessage(message);
            issue.setSeverity(toXtext(d.severity));
            issue.setCode("alan.compiler." + d.code);
            issue.setUriToProblem(uri);
            issue.setOffset(d.offset);
            issue.setLength(d.length);
            int[] start = lines.lineColumn(d.offset);
            int[] end = lines.lineColumn(d.offset + d.length);
            issue.setLineNumber(start[0]);
            issue.setColumn(start[1]);
            issue.setLineNumberEnd(end[0]);
            issue.setColumnEnd(end[1]);
            result.add(issue);
        }
        return result;
    }

    /**
     * The compiler's transcoding abort, which is a character problem wearing the
     * clothes of an internal failure. Matched on the function name rather than the
     * 997 code alone, since 997 is the generic system-error number and is used for
     * unrelated internal errors too.
     */

    /**
     * What to say when the compiler could not read the project as UTF-8.
     *
     * <p>Names the offending files where we can find them. Two causes produce the
     * identical error from the compiler: a character above U+00FF (which we mark
     * where it occurs) or a file that is not UTF-8 at all. Naming files settles the
     * second, which is much the commoner: older Alan sources, and whole libraries of
     * them, are ISO-8859-1.
     */
    private static String conversionFailureMessage(Path main) {
        List<Path> offenders = ProjectFiles.notUtf8(ProjectFiles.reachableFrom(main));
        if (offenders.isEmpty()) {
            return "The Alan compiler could not read this project, so no other errors "
                    + "can be reported. Either a source file contains a character that "
                    + "cannot be represented in ISO-8859-1 -- those are marked where they "
                    + "occur -- or a source file is not UTF-8. Older Alan sources are "
                    + "ISO-8859-1; check the encoding shown in the status bar.";
        }
        StringBuilder names = new StringBuilder();
        for (int i = 0; i < offenders.size() && i < 5; i++) {
            names.append(i == 0 ? "" : ", ").append(offenders.get(i).getFileName());
        }
        if (offenders.size() > 5) {
            names.append(" and ").append(offenders.size() - 5).append(" more");
        }
        // The directory matters as much as the name here: these are usually a shared
        // library reached through Import, sitting outside the folder that is open, so
        // "convert the files you can see" has already been done and did not help.
        return "The Alan compiler could not read this project, so no other errors can be "
                + "reported. " + offenders.size() + (offenders.size() == 1 ? " file is" : " files are")
                + " not UTF-8: " + names + ". "
                + (offenders.get(0).getParent() != null
                        ? "The first is in " + offenders.get(0).getParent() + ". " : "")
                + "Open the folder containing them to convert them, or convert them with "
                + "iconv -f ISO-8859-1 -t UTF-8.";
    }

    private static boolean isConversionFailure(AlanCompilerRunner.Diagnostic d) {
        return d.message != null && d.message.contains("readWithConversionFromUtf8");
    }

    /**
     * Diagnostics for the whole project, compiled from disk and cached until any
     * source file's timestamp changes. The first import validated in a build triggers
     * the compile; every other import reuses the result -- so an 80-file workspace
     * costs one compile, not one per file. (The main is handled separately from its
     * live buffer, so unsaved main edits still validate.)
     */
    private List<AlanCompilerRunner.Diagnostic> projectDiagnostics(Path dir, Path main) {
        String signature = signatureOf(dir);
        ProjectCompile cached = CACHE.get(dir);
        if (cached != null && cached.signature.equals(signature)) {
            return cached.diagnostics;
        }
        synchronized (CACHE) {
            cached = CACHE.get(dir);
            if (cached != null && cached.signature.equals(signature)) {
                return cached.diagnostics;
            }
            String mainText = readFile(main);
            List<AlanCompilerRunner.Diagnostic> diags = mainText == null
                    ? new ArrayList<>()
                    : compiler.run(mainText, dir, main.getFileName().toString());
            CACHE.put(dir, new ProjectCompile(signature, diags));
            return diags;
        }
    }

    /** A signature of all Alan source files in a directory (name + last-modified). */
    private static String signatureOf(Path dir) {
        try (Stream<Path> files = Files.list(dir)) {
            return files
                    .filter(p -> {
                        String n = p.getFileName().toString().toLowerCase();
                        return n.endsWith(".alan") || n.endsWith(".i");
                    })
                    .sorted()
                    .map(AlanResourceValidator::stamp)
                    .collect(Collectors.joining("|"));
        } catch (IOException e) {
            return "";
        }
    }

    private static String stamp(Path p) {
        try {
            return p.getFileName() + ":" + Files.getLastModifiedTime(p).toMillis();
        } catch (IOException e) {
            return p.getFileName() + ":0";
        }
    }

    private static final class ProjectCompile {
        final String signature;
        final List<AlanCompilerRunner.Diagnostic> diagnostics;

        ProjectCompile(String signature, List<AlanCompilerRunner.Diagnostic> diagnostics) {
            this.signature = signature;
            this.diagnostics = diagnostics;
        }
    }

    /** Text of the resource: the parsed buffer if available, else the file on disk. */
    private static String resourceText(Resource resource, Path file) {
        if (!resource.getContents().isEmpty()) {
            ICompositeNode node = NodeModelUtils.getNode(resource.getContents().get(0));
            if (node != null) {
                return node.getRootNode().getText();
            }
        }
        return readFile(file);
    }

    private static String readFile(Path file) {
        if (file == null) {
            return null;   // a URI we could not turn into a path; nothing to read
        }
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            AlanLog.warn("Could not read " + file + " (" + e + "), so it was not validated.");
            return null;
        }
    }

    /** The lexically-first .alan file in a directory, or null. */
    private static Path firstAlanIn(Path dir) {
        try (Stream<Path> s = Files.list(dir)) {
            return s.filter(p -> p.getFileName().toString().toLowerCase().endsWith(".alan"))
                    .sorted()
                    .findFirst()
                    .orElse(null);
        } catch (IOException e) {
            AlanLog.warn("Could not list " + dir + " (" + e + "), so the project's main "
                    + "file could not be found and imports were not validated.");
            return null;
        }
    }

    private static String baseName(String path) {
        String p = path.replace('\\', '/');
        return p.substring(p.lastIndexOf('/') + 1);
    }

    /** True for an Alan source file (.alan main or .i include). */
    private static boolean isAlanSource(URI uri) {
        if (uri == null) {
            return false;
        }
        String ext = uri.fileExtension();
        return "alan".equalsIgnoreCase(ext) || "i".equalsIgnoreCase(ext);
    }

    private static Severity toXtext(AlanCompilerRunner.Severity s) {
        switch (s) {
            case WARNING: return Severity.WARNING;
            case INFO:    return Severity.INFO;
            default:      return Severity.ERROR;
        }
    }

    private static Path fileDirOf(URI uri) {
        return FilePaths.dirOf(uri);
    }

    /** 0-based char offset -> 1-based (line, column), matching Xtext Issue positions. */
    private static final class LineMap {
        private final int[] lineStart; // offset of the start of each line

        LineMap(String text) {
            List<Integer> starts = new ArrayList<>();
            starts.add(0);
            for (int i = 0; i < text.length(); i++) {
                if (text.charAt(i) == '\n') {
                    starts.add(i + 1);
                }
            }
            lineStart = starts.stream().mapToInt(Integer::intValue).toArray();
        }

        int[] lineColumn(int offset) {
            int lo = 0, hi = lineStart.length - 1, line = 0;
            while (lo <= hi) {
                int mid = (lo + hi) >>> 1;
                if (lineStart[mid] <= offset) { line = mid; lo = mid + 1; } else { hi = mid - 1; }
            }
            return new int[] { line + 1, offset - lineStart[line] + 1 };
        }
    }
}
