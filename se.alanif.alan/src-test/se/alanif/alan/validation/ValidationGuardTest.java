package se.alanif.alan.validation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.util.ArrayList;
import java.util.List;

import org.eclipse.xtext.validation.Issue;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import se.alanif.alan.util.AlanLog;

/**
 * What happens when one half of validation blows up.
 *
 * <p>The rule under test is not "we catch the exception" -- it is what the AUTHOR is
 * left with. Carrying on is right: a failing encoding scan must not cost them the
 * compiler's errors. Carrying on SILENTLY is what made a broken Windows platform
 * survive eight releases, because a Problems panel with nothing in it is exactly what
 * a clean project looks like, and nothing on any surface told them apart.
 */
class ValidationGuardTest {

	private static Issue issue(String message) {
		Issue.IssueImpl created = new Issue.IssueImpl();
		created.setMessage(message);
		return created;
	}

	/** What the server said on stderr while {@code body} ran. */
	private static String saidWhile(Runnable body) {
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

	@Test
	@DisplayName("a contributor that fails does not take the other problems with it")
	void otherProblemsSurvive() {
		List<Issue> issues = new ArrayList<>();
		issues.add(issue("a real error the author needs"));

		saidWhile(() -> AlanResourceValidator.addGuarded(issues, "The encoding scan", () -> {
			throw new IllegalStateException("scan exploded");
		}));

		assertEquals(1, issues.size(), "the surviving contributor's issue was lost");
		assertEquals("a real error the author needs", issues.get(0).getMessage());
	}

	@Test
	@DisplayName("a contributor that fails says so, and says what is now missing")
	void failureIsNamed() {
		String said = saidWhile(() -> AlanResourceValidator.addGuarded(
				new ArrayList<>(), "The Alan compiler check", () -> {
					throw new IllegalStateException("compiler exploded");
				}));

		// The author's question is never "what was the stack trace" -- it is "why is
		// this panel empty". Both halves have to be there: which part gave up, and
		// what they are consequently not being told.
		assertTrue(said.contains("The Alan compiler check"), "did not say WHICH part failed: " + said);
		assertTrue(said.contains("compiler exploded"), "did not say WHY it failed: " + said);
		assertTrue(said.contains("missing"), "did not say what is now absent: " + said);
	}

	@Test
	@DisplayName("a contributor that works is not talked about")
	void successIsSilent() {
		List<Issue> issues = new ArrayList<>();

		String said = saidWhile(() -> AlanResourceValidator.addGuarded(
				issues, "The encoding scan", () -> List.of(issue("a character above U+00FF"))));

		assertEquals(1, issues.size());
		// Validation runs on every keystroke. A channel that says something on each
		// one is a channel nobody reads, which is the problem we started with.
		assertEquals("", said, "said something about a scan that worked: " + said);
	}
}
