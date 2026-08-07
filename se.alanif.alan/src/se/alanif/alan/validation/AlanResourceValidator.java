package se.alanif.alan.validation;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.xtext.diagnostics.Severity;
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
 */
public class AlanResourceValidator extends ResourceValidatorImpl {

    private final AlanCompilerRunner compiler = AlanCompilerRunner.fromEnvironment();

    @Override
    public List<Issue> validate(Resource resource, CheckMode mode, CancelIndicator monitor) {
        List<Issue> issues = new ArrayList<>(super.validate(resource, mode, monitor));
        try {
            issues.addAll(compilerIssues(resource));
        } catch (RuntimeException e) {
            // never let the external tool break normal validation
        }
        return issues;
    }

    private List<Issue> compilerIssues(Resource resource) {
        List<Issue> result = new ArrayList<>();
        if (!compiler.isAvailable() || resource.getContents().isEmpty()) {
            return result;
        }
        // Only a .alan file is a compile input. An imported .i (and other includes)
        // cannot be compiled on its own -- Alan splices them in at scan time -- so
        // running the compiler on one yields spurious errors. Skip it here; once the
        // project descriptor lands, editing a .i will compile the project's MAIN
        // file (explicit in alan.json, else the first .alan in the dir) instead.
        if (!isAlanSource(resource.getURI())) {
            return result;
        }
        Path sourceDir = fileDirOf(resource.getURI());
        if (sourceDir == null) {
            return result;
        }
        EObject root = resource.getContents().get(0);
        String text = NodeModelUtils.getNode(root).getRootNode().getText();
        LineMap lines = new LineMap(text);

        for (AlanCompilerRunner.Diagnostic d : compiler.run(text, sourceDir)) {
            Issue.IssueImpl issue = new Issue.IssueImpl();
            issue.setMessage(d.message);
            issue.setSeverity(toXtext(d.severity));
            issue.setCode("alan.compiler." + d.code);
            issue.setUriToProblem(resource.getURI());
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

    private static Severity toXtext(AlanCompilerRunner.Severity s) {
        switch (s) {
            case WARNING: return Severity.WARNING;
            case INFO:    return Severity.INFO;
            default:      return Severity.ERROR;
        }
    }

    /** True only for a .alan file -- the unit the compiler can be run on directly. */
    private static boolean isAlanSource(URI uri) {
        return uri != null && "alan".equalsIgnoreCase(uri.fileExtension());
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
