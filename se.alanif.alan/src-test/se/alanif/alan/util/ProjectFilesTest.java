package se.alanif.alan.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Following a project's imports, and finding the file the compiler choked on.
 *
 * <p>Modelled on the case that prompted it: an Italian Cloak of Darkness, one UTF-8
 * main importing a library two directories up, every file of which is still
 * ISO-8859-1. The compiler reports that as a system error against the MAIN at line 0,
 * so unless we find the real file ourselves the author is told only that something,
 * somewhere, cannot be read.
 */
@DisplayName("A project's files")
class ProjectFilesTest {

	@Test
	@DisplayName("include imports reached outside the folder that is open")
	void followsImportsOutOfTheWorkspace(@TempDir Path root) throws IOException {
		Path lib = Files.createDirectories(root.resolve("alanlib_ita"));
		Path game = Files.createDirectories(root.resolve("demo/cloak"));
		write(lib.resolve("lib_italian.i"), "Import 'lib_verbi.i'.\n", StandardCharsets.UTF_8);
		write(lib.resolve("lib_verbi.i"), "-- verbs\n", StandardCharsets.UTF_8);
		Path main = game.resolve("cloak.alan");
		write(main, "Import '../../alanlib_ita/lib_italian.i'.\nStart at foo.\n", StandardCharsets.UTF_8);

		List<Path> files = ProjectFiles.reachableFrom(main);

		assertEquals(3, files.size(), "main plus both library files: " + files);
		assertTrue(files.contains(lib.resolve("lib_italian.i").toAbsolutePath().normalize()));
		assertTrue(files.contains(lib.resolve("lib_verbi.i").toAbsolutePath().normalize()));
	}

	@Test
	@DisplayName("are found once each, even when imports form a cycle")
	void survivesCycles(@TempDir Path root) throws IOException {
		write(root.resolve("a.alan"), "Import 'b.i'.\n", StandardCharsets.UTF_8);
		write(root.resolve("b.i"), "Import 'a.alan'.\n", StandardCharsets.UTF_8);

		assertEquals(2, ProjectFiles.reachableFrom(root.resolve("a.alan")).size());
	}

	@Test
	@DisplayName("can say which of them the compiler cannot read as UTF-8")
	void namesTheFileThatIsNotUtf8(@TempDir Path root) throws IOException {
		Path main = root.resolve("cloak.alan");
		Path lib = root.resolve("lib_italian.i");
		write(main, "Import 'lib_italian.i'.\n", StandardCharsets.UTF_8);
		// The real library's bytes: 'è' as a single 0xE8, legal ISO-8859-1 and not
		// legal UTF-8 -- which is exactly what the compiler refuses.
		Files.write(lib, "Il sacco è pieno.\n".getBytes(StandardCharsets.ISO_8859_1));

		List<Path> bad = ProjectFiles.notUtf8(ProjectFiles.reachableFrom(main));

		assertEquals(1, bad.size(), "only the library is at fault: " + bad);
		assertEquals("lib_italian.i", bad.get(0).getFileName().toString());
	}

	@Test
	@DisplayName("are not blamed for an import that does not exist")
	void ignoresMissingImports(@TempDir Path root) throws IOException {
		write(root.resolve("a.alan"), "Import 'nowhere/missing.i'.\n", StandardCharsets.UTF_8);

		assertEquals(1, ProjectFiles.reachableFrom(root.resolve("a.alan")).size());
	}

	private void write(Path path, String text, java.nio.charset.Charset charset) throws IOException {
		Files.write(path, text.getBytes(charset));
	}
}
