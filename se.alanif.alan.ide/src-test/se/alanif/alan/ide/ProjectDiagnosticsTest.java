package se.alanif.alan.ide;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.eclipse.lsp4j.PublishDiagnosticsParams;
import org.junit.jupiter.api.Test;

import se.alanif.alan.compiler.AlanCompilerRunner;

/**
 * Errors reaching the files they are actually in.
 *
 * <p>The bug this exists for: an author opened an 83-file adventure, pressed Play,
 * watched thirty errors scroll past, and found the Problems panel saying "No problems
 * have been detected in the workspace" -- because the errors were in imported files
 * nobody had opened, and Xtext only publishes for files the editor asks about.
 */
class ProjectDiagnosticsTest {

	private static AlanCompilerRunner.Diagnostic error(String file, int offset, String message) {
		return new AlanCompilerRunner.Diagnostic(
				file, offset, 4, AlanCompilerRunner.Severity.ERROR, "316", message);
	}

	/** A project of two files, the second of which nobody would have open. */
	private Path project() throws Exception {
		Path dir = Files.createTempDirectory("alan-diags");
		Files.writeString(dir.resolve("game.alan"), "Import 'rooms.i'.\n\nStart at kitchen.\n");
		Files.writeString(dir.resolve("rooms.i"),
				"The kitchen IsA location\n  Description \"A room.\"\nEnd the kitchen.\n");
		return dir;
	}

	@Test
	void errorsReachAFileNobodyHasOpened() throws Exception {
		Path dir = project();
		List<PublishDiagnosticsParams> sent = new ArrayList<>();
		AlanServerExtension.setClientForTest(RecordingClient.into(sent));

		new AlanProjectDiagnostics().publish(dir,
				List.of(error("rooms.i", 27, "Attribute 'cover' is not defined")));

		assertEquals(1, sent.size(), "one file had errors, so one publish");
		assertTrue(sent.get(0).getUri().endsWith("rooms.i"), sent.get(0).getUri());
		assertEquals(1, sent.get(0).getDiagnostics().size());
		// Offset 27 is on the second line of rooms.i -- LSP lines are 0-based.
		assertEquals(1, sent.get(0).getDiagnostics().get(0).getRange().getStart().getLine());
	}

	@Test
	void aFileWithoutErrorsIsNotSpokenAbout() throws Exception {
		Path dir = project();
		List<PublishDiagnosticsParams> sent = new ArrayList<>();
		AlanServerExtension.setClientForTest(RecordingClient.into(sent));

		new AlanProjectDiagnostics().publish(dir, List.of(error("rooms.i", 0, "boom")));

		assertTrue(sent.stream().noneMatch(p -> p.getUri().endsWith("game.alan")),
				"a clean file should not be published to at all");
	}

	@Test
	void errorsThatAreFixedAreCleared() throws Exception {
		Path dir = project();
		List<PublishDiagnosticsParams> sent = new ArrayList<>();
		AlanServerExtension.setClientForTest(RecordingClient.into(sent));

		AlanProjectDiagnostics diagnostics = new AlanProjectDiagnostics();
		diagnostics.publish(dir, List.of(error("rooms.i", 0, "boom")));
		sent.clear();
		diagnostics.publish(dir, List.of());   // the author fixed it

		// The half that is easy to forget: without this the old error sits in the panel
		// for ever, describing a problem that no longer exists.
		assertEquals(1, sent.size(), "the file that had errors must be told it is clean");
		assertTrue(sent.get(0).getUri().endsWith("rooms.i"));
		assertEquals(List.of(), sent.get(0).getDiagnostics());
	}
}
