package se.alanif.alan.compiler;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
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
        public final String file;   // the source file the compiler reported (bare name)
        public final int offset;    // 0-based char offset INTO that file
        public final int length;
        public final Severity severity;
        public final String code;
        public final String message;

        Diagnostic(String file, int offset, int length, Severity severity, String code, String message) {
            this.file = file;
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
    public static AlanCompilerRunner fromConfiguration() {
        String p = se.alanif.alan.AlanConfiguration.compiler();
        return new AlanCompilerRunner(p != null && !p.isEmpty() ? p : "alan");
    }

    /** The command this runner would invoke -- for messages that must name it. */
    public String path() {
        return compilerPath;
    }

    public boolean isAvailable() {
        if (compilerPath == null) {
            return false;
        }
        File f = new File(compilerPath);
        return f.isAbsolute() ? f.canExecute() : true; // bare name -> resolved via PATH
    }

    /**
     * Compile {@code text} as the project's main file and return diagnostics for
     * the whole compile -- each carries the source file the compiler named, so the
     * caller can route errors in spliced imports to the right document. Imports
     * resolve relative to {@code sourceDir} (passed via -include and as the working
     * directory). The main is compiled from a temp copy (so unsaved edits to the
     * main are validated); {@code entryName} is the main's real name, which we
     * substitute for the temp's name in reported diagnostics.
     */
    public List<Diagnostic> run(String text, Path sourceDir, String entryName) {
        List<Diagnostic> out = new ArrayList<>();
        Path tmp = null;
        try {
            tmp = Files.createTempFile("alan-lsp-", ".alan");
            String tmpName = tmp.getFileName().toString();
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
            if (!proc.waitFor(60, TimeUnit.SECONDS)) {
                proc.destroyForcibly();
                se.alanif.alan.util.AlanLog.warn("The Alan compiler did not finish within 60 "
                        + "seconds and was stopped; no diagnostics for this compile.");
                return out;
            }
            String output = new String(outBytes, StandardCharsets.UTF_8);
            for (String raw : output.split("\n")) {
                Matcher m = LINE.matcher(raw.trim());
                if (!m.matches()) {
                    continue;
                }
                String file = m.group("file");
                // The compiler names the main under our temp file; relabel it to the
                // main's real name so callers can match diagnostics by file.
                String base = file.replace('\\', '/');
                base = base.substring(base.lastIndexOf('/') + 1);
                if (base.equals(tmpName)) {
                    file = entryName;
                }
                int start = Integer.parseInt(m.group("start"));
                int end = Integer.parseInt(m.group("end"));
                out.add(new Diagnostic(file, start, Math.max(0, end - start),
                        severity(m.group("sev")), m.group("code"), m.group("msg")));
            }
            se.alanif.alan.util.AlanLog.warn(
                    unreadableOutputWarning(proc.exitValue(), output, out.size()));
        } catch (IOException | InterruptedException e) {
            // Still no diagnostics rather than a broken validation -- but say so. An
            // author whose compiler path is wrong sees an empty Problems panel, which
            // is indistinguishable from a clean project unless we name the reason.
            se.alanif.alan.util.AlanLog.warn("Could not run the Alan compiler '" + compilerPath
                    + "': " + e + ". No compiler diagnostics will be reported.");
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
        } finally {
            if (tmp != null) {
                cleanupArtifacts(tmp, sourceDir);
            }
        }
        return out;
    }

    /**
     * Remove the temp input AND every file the compiler spawned from it. The
     * compiler names its outputs ({@code .a3c}, logs, ...) after the input's
     * basename and may write them next to the input, in its working directory, or
     * in the process CWD -- so sweep all three. The temp stem is unique per run
     * (see {@link Files#createTempFile}), so matching {@code <stem>*} can only hit
     * this run's own artifacts, never a user's file or a concurrent run's.
     */
    private static void cleanupArtifacts(Path tmp, Path sourceDir) {
        String name = tmp.getFileName().toString();
        int dot = name.lastIndexOf('.');
        String stem = dot >= 0 ? name.substring(0, dot) : name; // alan-lsp-<unique>

        Set<Path> dirs = new LinkedHashSet<>();
        Path parent = tmp.getParent();
        if (parent != null) {
            dirs.add(parent);
        }
        if (sourceDir != null) {
            dirs.add(sourceDir);
        }
        dirs.add(Paths.get(System.getProperty("user.dir")));

        for (Path dir : dirs) {
            try (DirectoryStream<Path> ds = Files.newDirectoryStream(dir, stem + "*")) {
                for (Path p : ds) {
                    try { Files.deleteIfExists(p); } catch (IOException ignored) { }
                }
            } catch (IOException ignored) {
                // dir gone / unreadable -- nothing to clean there
            }
        }
    }

    /**
     * What to say when the compile FAILED and we understood none of it.
     *
     * <p>This was the last silence left in this class. A compiler that cannot be
     * started says so, and one that never finishes says so, but one that ran, failed,
     * and printed something outside the {@code -ide} format simply fell out of the
     * parse loop leaving an empty list -- which is the same empty list a clean project
     * produces, and therefore an empty Problems panel that looks like success. That
     * equivalence is the shape of every diagnostics bug this project has had.
     *
     * <p>A compiler too old for {@code -ide} or {@code -encoding} fails exactly here,
     * printing a usage message we cannot read, so its first line is quoted: it is the
     * whole diagnosis, and nothing else would ever show it to anyone.
     *
     * <p>Silence is still correct for a clean compile (status 0, nothing to report)
     * and for a failure we DID parse -- the errors are on screen, and repeating them
     * in the log would only train an author to ignore it.
     *
     * @return the warning, or null when there is nothing worth saying
     */
    static String unreadableOutputWarning(int status, String output, int parsed) {
        if (status == 0 || parsed > 0) {
            return null;
        }
        String first = firstNonBlankLine(output);
        return "The Alan compiler exited with status " + status
                + (first == null ? " without printing anything" : " and said: \"" + first + "\"")
                + ", but none of its output was in the -ide format this reads, so its "
                + "problems could not be reported. The compile really did fail -- the "
                + "errors are missing, not absent. An Alan compiler too old for -ide or "
                + "-encoding fails exactly like this.";
    }

    private static String firstNonBlankLine(String output) {
        for (String line : output.split("\n")) {
            String trimmed = line.trim();
            if (!trimmed.isEmpty()) {
                return trimmed.length() > 200 ? trimmed.substring(0, 197) + "..." : trimmed;
            }
        }
        return null;
    }

    private static Severity severity(String s) {
        switch (s) {
            case "W": return Severity.WARNING;
            case "I": return Severity.INFO;
            default:  return Severity.ERROR; // E, F, S
        }
    }
}
