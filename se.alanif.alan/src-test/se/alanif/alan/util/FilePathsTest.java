package se.alanif.alan.util;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The Windows path shape, asserted from Linux.
 *
 * <p>These are the exact strings EMF produced on a real Windows install, captured by
 * driving the shipped server over LSP with the bundled Windows JRE. Testing the
 * repair as a pure string function is deliberate: the bug only ever appeared on a
 * platform our CI does not run, so an assertion that needed Windows would have gone
 * on not being made.
 */
@DisplayName("A file path out of EMF")
class FilePathsTest {

	@Test
	@DisplayName("loses the leading separators EMF adds before a drive letter")
	void repairsDriveLetterPaths() {
		assertEquals("c:\\Users\\Thomas\\game.alan",
				FilePaths.repair("\\\\\\c:\\Users\\Thomas\\game.alan"));
		assertEquals("c:/Users/Thomas/game.alan",
				FilePaths.repair("///c:/Users/Thomas/game.alan"));
	}

	@Test
	@DisplayName("is left alone when it is already usable")
	void leavesGoodPaths() {
		assertEquals("/home/thoni/game.alan", FilePaths.repair("/home/thoni/game.alan"));
		assertEquals("C:\\Users\\Thomas\\game.alan", FilePaths.repair("C:\\Users\\Thomas\\game.alan"));
	}

	@Test
	@DisplayName("keeps the leading separators of a real UNC path")
	void leavesUncPaths() {
		// \\server\share is not the same shape as \\\c:, and stripping it would send
		// us looking for a local directory named after the server.
		assertEquals("\\\\server\\share\\game.alan", FilePaths.repair("\\\\server\\share\\game.alan"));
	}
}
