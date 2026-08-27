package se.alanif.alan.util;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Say when we decline to do something.
 *
 * <p>Written after a Windows path bug went unnoticed from 0.2.0 to 0.7.4. Every place
 * that could not do its work returned "nothing" instead: no directory, no diagnostics,
 * no definition. Nothing distinguished "this project is fine" from "we gave up", and
 * an empty Problems panel is what both look like. The eventual diagnosis took hours of
 * instrumenting a shipped jar to recover a message the code had already had and thrown
 * away.
 *
 * <p>Output goes to stderr, which the VS Code language client shows in the "Alan IF
 * Language Server" output channel, and which every other LSP client treats as the
 * server's log.
 *
 * <p>Messages are logged once each. These sites sit inside validation, which runs on
 * every keystroke, so an un-deduplicated warning would bury the channel it is meant to
 * make readable -- and a warning nobody reads is the problem we started with.
 */
public final class AlanLog {

	private static final Set<String> ALREADY_SAID = ConcurrentHashMap.newKeySet();

	private AlanLog() {
	}

	/** Report a reason we produced nothing, once per distinct message. */
	public static void warn(String message) {
		if (message != null && ALREADY_SAID.add(message)) {
			System.err.println("[alan-if] " + message);
		}
	}

	/** Forget what has been said, so a test can assert on a fresh server. */
	public static void reset() {
		ALREADY_SAID.clear();
	}
}
