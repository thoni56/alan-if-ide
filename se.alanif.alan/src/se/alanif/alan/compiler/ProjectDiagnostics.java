package se.alanif.alan.compiler;

import java.nio.file.Path;
import java.util.List;

/**
 * Where a whole project's compile result goes, when something can receive it.
 *
 * <p>Xtext publishes diagnostics for the resource it was asked to validate, and it is
 * only ever asked about files the editor has opened. One compile of an 83-file
 * adventure finds errors in files nobody has opened, and those had nowhere to go: the
 * Problems panel would say "No problems have been detected in the workspace" while the
 * terminal showed thirty. That is worse than saying nothing, because the panel looks
 * authoritative.
 *
 * <p>An interface, and not simply a call to the LSP client, because the language
 * runtime has no business knowing what LSP is -- and could not compile against it
 * anyway, since lsp4j arrives with the ide module rather than this one. The ide side
 * registers a sink at startup; without one, everything behaves exactly as before.
 */
public final class ProjectDiagnostics {

    /** Receives a project compile's diagnostics, whichever files they belong to. */
    public interface Sink {
        void publish(Path projectDir, List<AlanCompilerRunner.Diagnostic> diagnostics);
    }

    private static volatile Sink sink;

    private ProjectDiagnostics() {
    }

    public static void register(Sink newSink) {
        sink = newSink;
    }

    /** Hand a compile result on, if anyone is listening. */
    public static void publish(Path projectDir, List<AlanCompilerRunner.Diagnostic> diagnostics) {
        Sink current = sink;
        if (current != null && projectDir != null) {
            try {
                current.publish(projectDir, diagnostics);
            } catch (RuntimeException ignored) {
                // publishing is a courtesy; it must never break validation
            }
        }
    }
}
