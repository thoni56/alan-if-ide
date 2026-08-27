package se.alanif.alan.ide;

import java.util.Map;

import org.eclipse.xtext.ide.server.ILanguageServerAccess;
import org.eclipse.xtext.ide.server.ILanguageServerExtension;

import se.alanif.alan.AlanConfiguration;

/**
 * Take the workspace's configuration off the LSP wire at startup.
 *
 * <p>{@code ILanguageServerAccess} hands us the {@code InitializeParams}, which is
 * where every LSP client puts its server-specific settings. Reading them here rather
 * than from the environment is what makes the server usable from Emacs, Neovim or
 * Helix without any of them knowing how our VS Code extension happens to launch it.
 *
 * <p>Values are read defensively: the options are whatever JSON the client chose to
 * send, and a client that sends nothing, or something of the wrong shape, must get a
 * working server rather than an exception during initialize.
 */
public class AlanServerExtension implements ILanguageServerExtension {

    @Override
    public void initialize(ILanguageServerAccess access) {
        try {
            Object options = access.getInitializeParams() == null
                    ? null : access.getInitializeParams().getInitializationOptions();
            AlanConfiguration.set(stringAt(options, "compilerPath"), stringAt(options, "keywordCase"));
        } catch (RuntimeException ignored) {
            // A malformed option is not worth refusing to start over; the fallbacks hold.
        }
    }

    /**
     * One key out of the client's options.
     *
     * <p>LSP4J hands initializationOptions over as whatever its JSON parser produced,
     * so this accepts both a plain Map and a Gson JsonObject without depending on Gson
     * being on the classpath in some particular version.
     */
    private static String stringAt(Object options, String key) {
        if (options instanceof Map) {
            Object value = ((Map<?, ?>) options).get(key);
            return value == null ? null : value.toString();
        }
        if (options == null) {
            return null;
        }
        try {
            Object member = options.getClass()
                    .getMethod("get", String.class).invoke(options, key);
            if (member == null) {
                return null;
            }
            Object asString = member.getClass().getMethod("getAsString").invoke(member);
            return asString == null ? null : asString.toString();
        } catch (ReflectiveOperationException | RuntimeException e) {
            return null;
        }
    }
}
