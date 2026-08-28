package se.alanif.alan.ide.symbol;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import se.alanif.alan.util.AlanLog;

/**
 * What navigation does when it cannot read the project around the open file.
 *
 * <p>This is the shape the Windows bug had: every cross-file scan came back empty and
 * said nothing, so "Go to Definition finds nothing" was indistinguishable from "that
 * name is not defined anywhere". It survived from 0.2.0 to 0.7.4 on the one platform
 * nobody ran. The fix is not to make the scan succeed -- a directory really can go
 * away -- but to make the failure audible.
 *
 * <p>The directory is deleted after the file is parsed, so the open document is still
 * live in memory while everything around it is gone. That is exactly the state a
 * broken path produced.
 */
class UnreadableProjectTest {

	private static NavigationFixture program() throws Exception {
		return NavigationFixture.of(
				"The gadget IsA object",          // 1
				"End the gadget.",                // 2
				"",
				"Every thing IsA object",         // 4
				"  Verb poke",                    // 5
				"    Does",                       // 6
				"      Describe <1>gadget.",      // 7
				"    End verb.",                  // 8
				"End every.");                    // 9
	}

	/** Delete the directory the sources live in, leaving the parsed resource behind. */
	private static void takeAwayTheProject(NavigationFixture program) throws Exception {
		Path dir = program.directory();
		try (Stream<Path> files = Files.list(dir)) {
			for (Path file : files.toList()) {
				Files.deleteIfExists(file);
			}
		}
		Files.deleteIfExists(dir);
	}

	/** What the server said on stderr while {@code body} ran. */
	private static String saidWhile(ThrowingRunnable body) throws Exception {
		AlanLog.reset();
		PrintStream original = System.err;
		ByteArrayOutputStream captured = new ByteArrayOutputStream();
		System.setErr(new PrintStream(captured));
		try {
			body.run();
		} finally {
			System.setErr(original);
		}
		return captured.toString();
	}

	private interface ThrowingRunnable {
		void run() throws Exception;
	}

	@Test
	@DisplayName("a name declared in the open file still resolves")
	void theOpenFileStillWorks() throws Exception {
		NavigationFixture program = program();
		takeAwayTheProject(program);

		// Degrading is right. The author keeps everything we can still answer from
		// the buffer in front of them, rather than losing navigation entirely.
		assertEquals(List.of(1), program.definitionsAt(1));
	}

	@Test
	@DisplayName("and the server says why it could not look any further")
	void theFailureIsAudible() throws Exception {
		NavigationFixture program = program();
		takeAwayTheProject(program);

		String said = saidWhile(() -> program.definitionsAt(1));

		assertTrue(said.contains("Could not list"),
				"navigation gave up on the project silently: " + said);
		// Naming the consequence, not just the errno: the author's question is why a
		// definition they know exists was not offered.
		assertTrue(said.contains("will not be found"),
				"said what failed but not what is missing because of it: " + said);
	}

	@Test
	@DisplayName("find-references degrades to the open file, and says so")
	void referencesSayWhatTheyCovered() throws Exception {
		NavigationFixture program = program();
		takeAwayTheProject(program);

		String said = saidWhile(() -> program.referencesAt(1));

		assertTrue(said.contains("only the open file"),
				"find-references narrowed its scope without saying so: " + said);
	}
}
