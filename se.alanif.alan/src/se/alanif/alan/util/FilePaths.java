package se.alanif.alan.util;

import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.eclipse.emf.common.util.URI;

/**
 * The file a workspace URI names.
 *
 * <p>This exists because {@code Paths.get(uri.toFileString())} -- the obvious
 * spelling, and the one we used at four separate places -- does not work on Windows.
 * VS Code sends {@code file:///c:/Users/...}, whose authority is empty; EMF reads an
 * empty authority as a UNC host and renders the path as {@code \\\c:\Users\...},
 * three leading backslashes and all. {@code Paths.get} then throws
 * {@code InvalidPathException: Illegal character [:] in path at index 4}.
 *
 * <p>Every feature that needs a file on disk therefore did nothing on Windows: no
 * compiler diagnostics, and no cross-file navigation. It was invisible to us because
 * the exception was either swallowed as "no directory" or thrown out of a validation
 * whose only symptom is an empty Problems panel -- and because every machine we test
 * on hands us {@code file:///home/...}, which has no drive letter to trip over.
 */
public final class FilePaths {

	private FilePaths() {
	}

	/** The path a file URI names, or null if it names none we can use. */
	public static Path of(URI uri) {
		if (uri == null || !uri.isFile()) {
			return null;
		}
		String file = uri.toFileString();
		if (file == null) {
			return null;
		}
		try {
			return Paths.get(repair(file));
		} catch (InvalidPathException e) {
			AlanLog.warn("Cannot use '" + file + "' as a file path (" + e.getMessage()
					+ "), so nothing that needs the file on disk will run for " + uri);
			return null;
		}
	}

	/** The parent directory of {@link #of}, or null. */
	public static Path dirOf(URI uri) {
		Path path = of(uri);
		return path == null ? null : path.getParent();
	}

	/**
	 * Undo EMF's empty-authority mangling: drop leading separators when a drive letter
	 * follows them.
	 *
	 * <p>Kept as a pure function over strings so it can be asserted on any platform.
	 * The Windows-only bug it fixes is precisely the kind that a Linux CI cannot see,
	 * so the test must not need Windows to run.
	 *
	 * <p>A real UNC path ({@code \\server\share\file}) has leading separators too and
	 * must keep them -- which is why the drive letter, not the separators, is what
	 * decides.
	 */
	public static String repair(String file) {
		int start = 0;
		while (start < file.length() && (file.charAt(start) == '\\' || file.charAt(start) == '/')) {
			start++;
		}
		boolean driveFollows = start > 0 && start + 1 < file.length()
				&& Character.isLetter(file.charAt(start)) && file.charAt(start + 1) == ':';
		return driveFollows ? file.substring(start) : file;
	}
}
