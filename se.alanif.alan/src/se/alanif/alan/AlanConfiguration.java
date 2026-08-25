package se.alanif.alan;

/**
 * What the client told the server about this workspace.
 *
 * <p>Configuration used to arrive as environment variables set by the VS Code
 * extension's launcher, which quietly made the server VS-Code-specific: any other
 * editor would have had to know to set ALAN_COMPILER before spawning it. Now it
 * arrives over LSP as {@code initializationOptions}, which every client can send in
 * its own idiom -- eglot's {@code :initializationOptions}, nvim-lspconfig's
 * {@code init_options}, Helix's {@code config}. One server, many launchers, and the
 * launcher stays thin.
 *
 * <p>Deliberately a plain static holder rather than a Guice singleton: the runtime and
 * ide injectors are separate, and the values are set once, before any request is
 * served. That matches how the caches in this codebase already work.
 *
 * <p>The environment is still read as a FALLBACK, for a launcher that cannot send
 * options and for the dev loop -- but it is no longer the interface.
 */
public final class AlanConfiguration {

    private static volatile String compilerPath;
    private static volatile String keywordCase;

    private AlanConfiguration() {
    }

    /** Set from initializationOptions at startup. Null values leave the fallback in place. */
    public static void set(String compiler, String keywords) {
        if (compiler != null && !compiler.trim().isEmpty()) {
            compilerPath = compiler.trim();
        }
        if (keywords != null && !keywords.trim().isEmpty()) {
            keywordCase = keywords.trim();
        }
    }

    /** The Alan compiler: what the client said, else the environment, else bare 'alan'. */
    public static String compiler() {
        if (compilerPath != null) {
            return compilerPath;
        }
        String fromEnv = System.getenv("ALAN_COMPILER");
        return fromEnv != null && !fromEnv.isEmpty() ? fromEnv : "alan";
    }

    /** How Format Document cases keywords: what the client said, else the environment. */
    public static String keywordCase() {
        return keywordCase != null ? keywordCase : System.getenv("ALANIF_KEYWORD_CASE");
    }
}
