package se.alanif.alan.ide;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Stream;

import org.eclipse.lsp4j.Diagnostic;
import org.eclipse.lsp4j.DiagnosticSeverity;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.PublishDiagnosticsParams;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.services.LanguageClient;

import se.alanif.alan.compiler.AlanCompilerRunner;
import se.alanif.alan.compiler.ProjectDiagnostics;

/**
 * Send a project compile's errors to every file they belong to.
 *
 * <p>Xtext publishes diagnostics for the resource it was asked to validate, and it is
 * only asked about files the editor has opened. So an author who opened the main,
 * pressed Play and watched thirty errors scroll past would then find the Problems
 * panel claiming "No problems have been detected in the workspace" -- because the
 * errors were in imported files nobody had opened. Reported from a real 83-file
 * project; it is worse than saying nothing, since the panel looks authoritative.
 *
 * <p>LSP allows publishing against ANY uri, so one compile now reaches all of them.
 */
public class AlanProjectDiagnostics implements ProjectDiagnostics.Sink {

    /**
     * Files we have published errors to, so they can be cleared later.
     *
     * <p>The half that is easy to forget and produces the worse bug: a file whose
     * errors are fixed must be sent an EMPTY list, or its old errors sit in the panel
     * forever, describing a problem that no longer exists.
     */
    private final Map<Path, List<String>> published = new HashMap<>();

    @Override
    public void publish(Path projectDir, List<AlanCompilerRunner.Diagnostic> diagnostics) {
        LanguageClient client = AlanServerExtension.client();
        if (client == null) {
            return;
        }
        Map<String, List<AlanCompilerRunner.Diagnostic>> byFile = new HashMap<>();
        for (AlanCompilerRunner.Diagnostic d : diagnostics) {
            byFile.computeIfAbsent(baseName(d.file).toLowerCase(Locale.ROOT),
                    k -> new ArrayList<>()).add(d);
        }

        List<String> nowPublished = new ArrayList<>();
        for (Path file : sourcesIn(projectDir)) {
            String uri = file.toUri().toString();
            List<AlanCompilerRunner.Diagnostic> mine =
                    byFile.get(file.getFileName().toString().toLowerCase(Locale.ROOT));
            if (mine == null || mine.isEmpty()) {
                continue;   // cleared below, and only if we had published to it before
            }
            client.publishDiagnostics(new PublishDiagnosticsParams(uri, translate(file, mine)));
            nowPublished.add(uri);
        }

        // Anything we spoke about last time and not this time is now clean.
        List<String> previous = published.getOrDefault(projectDir, List.of());
        for (String uri : previous) {
            if (!nowPublished.contains(uri)) {
                client.publishDiagnostics(new PublishDiagnosticsParams(uri, List.of()));
            }
        }
        published.put(projectDir, nowPublished);
    }

    /**
     * Turn compiler offsets into editor positions.
     *
     * <p>Read from disk rather than from the editor: these are files nobody has open,
     * which is the entire point. A file we cannot read is skipped rather than guessed
     * at -- a diagnostic in the wrong place is worse than one that is missing.
     */
    private List<Diagnostic> translate(Path file, List<AlanCompilerRunner.Diagnostic> diagnostics) {
        String text;
        try {
            text = Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException | RuntimeException e) {
            return List.of();
        }
        int[] lineStarts = lineStartsOf(text);
        List<Diagnostic> out = new ArrayList<>();
        for (AlanCompilerRunner.Diagnostic d : diagnostics) {
            Diagnostic diagnostic = new Diagnostic();
            diagnostic.setMessage(d.message);
            diagnostic.setSeverity(severityOf(d.severity));
            diagnostic.setCode("alan.compiler." + d.code);
            diagnostic.setSource("Alan");
            diagnostic.setRange(new Range(
                    positionOf(lineStarts, text, d.offset),
                    positionOf(lineStarts, text, d.offset + d.length)));
            out.add(diagnostic);
        }
        return out;
    }

    private static int[] lineStartsOf(String text) {
        List<Integer> starts = new ArrayList<>();
        starts.add(0);
        for (int i = 0; i < text.length(); i++) {
            if (text.charAt(i) == '\n') {
                starts.add(i + 1);
            }
        }
        int[] array = new int[starts.size()];
        for (int i = 0; i < array.length; i++) {
            array[i] = starts.get(i);
        }
        return array;
    }

    private static Position positionOf(int[] lineStarts, String text, int offset) {
        int clamped = Math.max(0, Math.min(offset, text.length()));
        int low = 0;
        int high = lineStarts.length - 1;
        while (low < high) {
            int mid = (low + high + 1) / 2;
            if (lineStarts[mid] <= clamped) {
                low = mid;
            } else {
                high = mid - 1;
            }
        }
        return new Position(low, clamped - lineStarts[low]);
    }

    private static DiagnosticSeverity severityOf(AlanCompilerRunner.Severity severity) {
        switch (severity) {
            case WARNING: return DiagnosticSeverity.Warning;
            case INFO:    return DiagnosticSeverity.Information;
            default:      return DiagnosticSeverity.Error;
        }
    }

    private static List<Path> sourcesIn(Path dir) {
        try (Stream<Path> files = Files.list(dir)) {
            return files.filter(p -> {
                String n = p.getFileName().toString().toLowerCase(Locale.ROOT);
                return n.endsWith(".alan") || n.endsWith(".i");
            }).sorted().toList();
        } catch (IOException e) {
            return List.of();
        }
    }

    private static String baseName(String reported) {
        String path = reported.replace('\\', '/');
        return path.substring(path.lastIndexOf('/') + 1);
    }
}
