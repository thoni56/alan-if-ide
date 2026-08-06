package se.alanif.alan.compiler;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Runs the Alan compiler ({@code alan -ide}) over a source buffer and parses its
 * compact diagnostics. The compiler is Alan's own semantic checker -- its errors
 * (undefined ids, bad start location, ...) are what the old AlanIDE surfaced and
 * are richer than Xtext's parse-level validation.
 *
 * The {@code -ide} format is one line per message:
 *   "file", line L START-END: CODE SEV : message
 * where START/END are 0-based absolute character offsets (end-exclusive) -- which
 * is exactly what Xtext's ValidationMessageAcceptor wants, so no line/col math.
 */
public final class AlanCompilerRunner {

    public enum Severity { ERROR, WARNING, INFO }

    public static final class Diagnostic {
        public final int offset;
        public final int length;
        public final Severity severity;
        public final String code;
        public final String message;

        Diagnostic(int offset, int length, Severity severity, String code, String message) {
            this.offset = offset;
            this.length = length;
            this.severity = severity;
            this.code = code;
            this.message = message;
        }
    }

    // "file", line 12 34-56: 310 E : message
    private static final Pattern LINE = Pattern.compile(
            "^\"(?<file>.*)\", line (?<line>\\d+) (?<start>\\d+)-(?<end>\\d+): (?<code>\\d+) (?<sev>[A-Z]) : (?<msg>.*)$");

    private final String compilerPath;

    public AlanCompilerRunner(String compilerPath) {
        this.compilerPath = compilerPath;
    }

    /** Locate the compiler: the ALAN_COMPILER env var, else {@code alan} on PATH. */
    public static AlanCompilerRunner fromEnvironment() {
        String p = System.getenv("ALAN_COMPILER");
        return new AlanCompilerRunner(p != null && !p.isEmpty() ? p : "alan");
    }

    public boolean isAvailable() {
        if (compilerPath == null) {
            return false;
        }
        File f = new File(compilerPath);
        return f.isAbsolute() ? f.canExecute() : true; // bare name -> resolved via PATH
    }

    /**
     * Compile {@code text} and return diagnostics. Imports resolve relative to
     * {@code sourceDir} (passed via -include and as the working directory). Runs
     * on a temp copy of the live buffer, so it validates unsaved content.
     */
    public List<Diagnostic> run(String text, Path sourceDir) {
        List<Diagnostic> out = new ArrayList<>();
        Path tmp = null;
        try {
            tmp = Files.createTempFile("alan-lsp-", ".alan");
            Files.write(tmp, text.getBytes(StandardCharsets.UTF_8));

            List<String> cmd = new ArrayList<>();
            cmd.add(compilerPath);
            cmd.add("-ide");
            cmd.add("-encoding");
            cmd.add("utf8");
            if (sourceDir != null) {
                cmd.add("-include");
                cmd.add(sourceDir.toString());
            }
            cmd.add(tmp.toString());

            ProcessBuilder pb = new ProcessBuilder(cmd).redirectErrorStream(true);
            if (sourceDir != null && Files.isDirectory(sourceDir)) {
                pb.directory(sourceDir.toFile());
            }
            Process proc = pb.start();
            byte[] outBytes = proc.getInputStream().readAllBytes();
            if (!proc.waitFor(20, TimeUnit.SECONDS)) {
                proc.destroyForcibly();
                return out;
            }
            for (String raw : new String(outBytes, StandardCharsets.UTF_8).split("\n")) {
                Matcher m = LINE.matcher(raw.trim());
                if (!m.matches()) {
                    continue;
                }
                int start = Integer.parseInt(m.group("start"));
                int end = Integer.parseInt(m.group("end"));
                out.add(new Diagnostic(start, Math.max(0, end - start),
                        severity(m.group("sev")), m.group("code"), m.group("msg")));
            }
        } catch (IOException | InterruptedException e) {
            // Compiler missing/failed: surface nothing rather than break validation.
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
        } finally {
            if (tmp != null) {
                try { Files.deleteIfExists(tmp); } catch (IOException ignored) { }
            }
        }
        return out;
    }

    private static Severity severity(String s) {
        switch (s) {
            case "W": return Severity.WARNING;
            case "I": return Severity.INFO;
            default:  return Severity.ERROR; // E, F, S
        }
    }
}
