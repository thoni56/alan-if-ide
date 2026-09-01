package se.alanif.alan.compiler;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * What we say when the compiler's output is not the compiler's output we expected.
 *
 * <p>The rule under test is which SILENCES are allowed. A clean compile says nothing
 * and a parsed failure says nothing, because the author is already looking at the
 * answer in both cases. A failure we could not read must speak -- it produces exactly
 * the same empty diagnostic list as a clean project, and that equivalence is the shape
 * of every diagnostics bug this project has had.
 */
class CompilerOutputTest {

	@Test
	@DisplayName("a clean compile is silent, however little it printed")
	void cleanCompileSaysNothing() {
		assertNull(AlanCompilerRunner.unreadableOutputWarning(0, "", 0));
		assertNull(AlanCompilerRunner.unreadableOutputWarning(0, "alan 3.0beta8\n", 0));
	}

	@Test
	@DisplayName("a failure we parsed is silent -- the errors are already on screen")
	void parsedFailureSaysNothing() {
		assertNull(AlanCompilerRunner.unreadableOutputWarning(1,
				"\"x.alan\", line 3 40-45: 310 E : undefined\n", 1));
	}

	@Test
	@DisplayName("a failure we could not read names its status and its first line")
	void unreadableFailureIsReported() {
		// The case this exists for: a compiler too old for -ide prints a usage
		// message, nothing matches, and the author gets an empty Problems panel
		// that is indistinguishable from a clean project.
		String warning = AlanCompilerRunner.unreadableOutputWarning(2,
				"\nUsage: alan [-help] file\n", 0);
		assertNotNull(warning);
		assertTrue(warning.contains("status 2"), warning);
		assertTrue(warning.contains("Usage: alan [-help] file"), warning);
	}

	@Test
	@DisplayName("a failure that printed nothing says so, rather than quoting emptiness")
	void silentFailureIsReported() {
		String warning = AlanCompilerRunner.unreadableOutputWarning(1, "  \n \n", 0);
		assertNotNull(warning);
		assertTrue(warning.contains("without printing anything"), warning);
	}

	@Test
	@DisplayName("a very long first line is cut, so the log stays readable")
	void longFirstLineIsTruncated() {
		String warning = AlanCompilerRunner.unreadableOutputWarning(1, "x".repeat(500), 0);
		assertNotNull(warning);
		assertTrue(warning.contains("..."), warning);
		assertTrue(warning.length() < 500, "the whole 500-character line was quoted");
	}
}
