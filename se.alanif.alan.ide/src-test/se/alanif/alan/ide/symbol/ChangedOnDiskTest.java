package se.alanif.alan.ide.symbol;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.List;

import org.eclipse.emf.common.util.URI;
import org.eclipse.xtext.resource.XtextResource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Navigating to a file that has changed since it was last read.
 *
 * <p>The project index is cached and keyed on every source file's last-modified time,
 * so a saved edit does invalidate it and force a rebuild. The rebuild is what was
 * broken: it asked the resource set for each file, and a resource already loaded is
 * handed back WITHOUT being read again, so the rebuilt index was rebuilt out of the
 * same stale parse trees and carried the same stale positions.
 *
 * <p>Which is invisible until the edit moves something. Reported from a real session:
 * Go to Definition landed two lines above the declaration, on a region of exactly the
 * right length, because re-wrapping strings earlier in the file had added two lines
 * and the server was still answering from the file as it had been. Reloading the
 * window fixed it, which is the signature of state that outlives the file it describes.
 */
class ChangedOnDiskTest {

	private static NavigationFixture program() throws Exception {
		return NavigationFixture.of(
				"The kitchen IsA location",
				"End the kitchen.",
				"",
				"Every thing IsA object",
				"  Verb poke",
				"    Does",
				"      Describe <1>beacon.",     // declared in the OTHER file
				"    End verb.",
				"End every.");
	}

	/** Put a second source beside the open one, as a project has. */
	private static Path fileBeside(NavigationFixture program, String name, String... lines)
			throws Exception {
		Path file = program.directory().resolve(name);
		Files.writeString(file, String.join("\n", lines) + "\n");
		// Explicitly newer, so the test is about re-reading the file and not about
		// whether two writes landed in the same millisecond.
		Files.setLastModifiedTime(file, FileTime.fromMillis(System.currentTimeMillis() + 2000));
		return file;
	}

	@Test
	@DisplayName("a declaration that moved is found where it moved to")
	void aMovedDeclarationIsFoundWhereItNowIs() throws Exception {
		NavigationFixture program = program();
		fileBeside(program, "other.i",
				"The beacon IsA object at kitchen",   // 1
				"End the beacon.");

		assertEquals(List.of(1), program.definitionsAt(1), "the declaration as first written");

		// The author re-wraps a string above it and saves: same declaration, two lines
		// further down. Nothing about the name has changed.
		fileBeside(program, "other.i",
				"-- a comment the author added",      // 1
				"",                                   // 2
				"The beacon IsA object at kitchen",   // 3
				"End the beacon.");

		assertEquals(List.of(3), program.definitionsAt(1),
				"navigation still points at where the declaration used to be");
	}

	@Test
	@DisplayName("a file open with unsaved changes is answered from the editor, not the disk")
	void anUnsavedEditorWins() throws Exception {
		// The safety property the fix rests on, and the one a later simplification
		// would quietly remove. Discarding on last-modified is not merely a cheap test
		// for "has it changed" -- it is what keeps an unsaved buffer, which has not
		// moved on disk at all, from being thrown away and answered from the old file.
		NavigationFixture program = program();
		Path other = fileBeside(program, "other.i",
				"The beacon IsA object at kitchen",   // 1 -- what is on disk
				"End the beacon.");
		assertEquals(List.of(1), program.definitionsAt(1));

		// An editor opens it and types two lines in, without saving: the resource set
		// now holds newer text than the file does, and the file has not been touched.
		XtextResource open = (XtextResource) program.resources()
				.getResource(URI.createFileURI(other.toString()), true);
		String edited = "-- a line the author has just typed\n"
				+ "\n"
				+ "The beacon IsA object at kitchen\n"
				+ "End the beacon.\n";
		open.unload();
		open.load(new ByteArrayInputStream(edited.getBytes(StandardCharsets.UTF_8)), null);

		// Something else in the project changes, so the index rebuilds around it.
		fileBeside(program, "third.i", "-- another file entirely");

		assertEquals(List.of(3), program.definitionsAt(1),
				"the unsaved buffer was thrown away and the old file answered instead");
	}
}
