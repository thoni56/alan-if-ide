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

    private final AlanCompilerRunner compiler = AlanCompilerRunner.fromEnvironment();

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
            issues.addAll(compilerIssues(resource));
        } catch (RuntimeException e) {
            // never let the external tool break normal validation
        }
        return issues;
    }

    private List<Issue> compilerIssues(Resource resource) {
        List<Issue> result = new ArrayList<>();
        URI uri = resource.getURI();
        if (!compiler.isAvailable() || !isAlanSource(uri) || !uri.isFile()) {
            return result;
        }
        Path dir = fileDirOf(uri);
        Path resourceFile = uri.isFile() ? Paths.get(uri.toFileString()) : null;
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
        List<AlanCompilerRunner.Diagnostic> diags = main.equals(resourceFile)
                ? compiler.run(resourceText, dir, resourceName)
                : projectDiagnostics(dir, main);
        for (AlanCompilerRunner.Diagnostic d : diags) {
            if (!resourceName.equalsIgnoreCase(baseName(d.file))) {
                continue; // an error in some other file; it belongs to that document
            }
            Issue.IssueImpl issue = new Issue.IssueImpl();
            issue.setMessage(d.message);
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
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
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
        if (uri == null || !uri.isFile()) {
            return null;
        }
        try {
            return Paths.get(uri.toFileString()).getParent();
        } catch (RuntimeException e) {
            return null;
        }
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
