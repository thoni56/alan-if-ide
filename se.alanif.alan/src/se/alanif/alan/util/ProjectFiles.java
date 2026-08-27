package se.alanif.alan.util;

import java.io.IOException;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The files a compile actually reads, and whether the compiler can read them.
 *
 * <p>Alan splices imports in at scan time, so a project is its main plus everything
 * reachable through {@code Import} -- which is emphatically not "the files in this
 * directory". An Italian Cloak of Darkness is one file importing a library two
 * directories up, and when that library is not UTF-8 the compiler fails with
 * {@code SYSTEM ERROR: error converting from UTF-8 ... converter.c:133}, reported
 * against the MAIN at line 0. The one thing an author needs -- which file -- is the
 * one thing that message does not contain, and this is how we work it out instead.
 */
public final class ProjectFiles {

	/** {@code Import 'lib/thing.i'.} -- the quoted name is what we follow. */
	private static final Pattern IMPORT = Pattern.compile(
			"(?im)^[^'\"\\n]*?\\bimport\\s+(['\"])(.+?)\\1");

	/** Enough for any real project; a guard against a cycle we failed to notice. */
	private static final int LIMIT = 500;

	private ProjectFiles() {
	}

	/**
	 * Every existing file the compile reaches from {@code main}, main included.
	 *
	 * <p>Import paths resolve against the directory of the file that imports them,
	 * which is how the compiler resolves them, and is why a relative path like
	 * {@code ../../alanlib_ita/lib_italian.i} lands outside the workspace entirely.
	 */
	public static List<Path> reachableFrom(Path main) {
		Set<Path> seen = new LinkedHashSet<>();
		if (main != null) {
			collect(main, seen);
		}
		return new ArrayList<>(seen);
	}

	private static void collect(Path file, Set<Path> seen) {
		Path here = file.toAbsolutePath().normalize();
		if (seen.size() >= LIMIT || !Files.isRegularFile(here) || !seen.add(here)) {
			return;
		}
		// Read as ISO-8859-1: every byte maps to a character, so a file in ANY
		// single-byte encoding still yields readable ASCII import lines. Decoding as
		// UTF-8 would throw on exactly the files we are hunting for.
		String text;
		try {
			text = new String(Files.readAllBytes(here), StandardCharsets.ISO_8859_1);
		} catch (IOException e) {
			AlanLog.warn("Could not read " + here + " while following imports (" + e + ").");
			return;
		}
		Matcher m = IMPORT.matcher(text);
		while (m.find()) {
			Path imported = here.getParent() == null
					? Path.of(m.group(2)) : here.getParent().resolve(m.group(2));
			collect(imported, seen);
		}
	}

	/** Those of {@code files} the Alan compiler cannot read as UTF-8. */
	public static List<Path> notUtf8(Collection<Path> files) {
		List<Path> bad = new ArrayList<>();
		for (Path file : files) {
			if (!isUtf8(file)) {
				bad.add(file);
			}
		}
		return bad;
	}

	private static boolean isUtf8(Path file) {
		try {
			StandardCharsets.UTF_8.newDecoder()
					.onMalformedInput(CodingErrorAction.REPORT)
					.onUnmappableCharacter(CodingErrorAction.REPORT)
					.decode(java.nio.ByteBuffer.wrap(Files.readAllBytes(file)));
			return true;
		} catch (CharacterCodingException e) {
			return false;
		} catch (IOException e) {
			return true;   // unreadable is a different complaint; do not blame encoding
		}
	}
}
