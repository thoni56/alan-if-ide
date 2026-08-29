package se.alanif.alan.ide.formatting;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.xtext.parser.IParseResult;
import org.eclipse.xtext.resource.XtextResource;

import com.google.inject.Injector;

import se.alanif.alan.formatting.AlanStructuralFormatter;
import se.alanif.alan.formatting.AlanStructuralFormatter.KeywordCase;
import se.alanif.alan.ide.AlanIdeSetup;

/**
 * Alan source, formatted the way Format Document formats it.
 *
 * <p>Drives the real parser and the real indenter, because the indenter's whole
 * premise is the node model: it derives indentation from which body-wrapper nodes
 * span a line, and a fixture that faked the parse would be testing arithmetic
 * instead of the rule.
 *
 * <p>Nothing here is inherited from the old token indenter. That one could not tell
 * {@code Description "..."} from a statement body -- a word scanner cannot -- so its
 * behaviour is not a specification of anything, and none of it is treated as one.
 * These tests say what the structure-aware formatter should do, and they were written
 * by reading the rules it documents and checking the results against real Alan.
 */
final class FormatterFixture {

	private static Injector injector;

	private FormatterFixture() {
	}

	/** Format {@code lines}, four-space indent, no keyword recasing. */
	static String format(String... lines) {
		return format(KeywordCase.OFF, "    ", 4, lines);
	}

	/** Format with tabs, so the tab-aware column arithmetic is exercised too. */
	static String formatWithTabs(String... lines) {
		return format(KeywordCase.OFF, "\t", 4, lines);
	}

	static String format(KeywordCase keywordCase, String unit, int tabSize, String... lines) {
		String source = String.join("\n", lines) + "\n";
		try {
			if (injector == null) {
				injector = new AlanIdeSetup().createInjectorAndDoEMFRegistration();
			}
			ResourceSet resources = injector.getInstance(ResourceSet.class);
			Path file = Files.createTempDirectory("alan-fmt").resolve("test.alan");
			XtextResource resource =
					(XtextResource) resources.createResource(URI.createFileURI(file.toString()));
			resource.load(new ByteArrayInputStream(source.getBytes("UTF-8")), null);
			IParseResult parse = resource.getParseResult();
			// The service refuses to format a document with syntax errors, because the
			// node model is then partial. A test whose input does not parse would be
			// asserting against that partial tree, which is worth failing loudly over.
			if (parse == null || parse.getSyntaxErrors().iterator().hasNext()) {
				throw new IllegalArgumentException(
						"the test source does not parse, so formatting it proves nothing:\n" + source);
			}
			return new AlanStructuralFormatter().format(parse, source, unit, tabSize, keywordCase);
		} catch (RuntimeException e) {
			throw e;
		} catch (Exception e) {
			throw new RuntimeException(e);
		}
	}

	/** The formatted text as lines, for assertions that read like the file. */
	static String[] lines(String formatted) {
		String trimmed = formatted.endsWith("\n")
				? formatted.substring(0, formatted.length() - 1) : formatted;
		return trimmed.split("\n", -1);
	}
}
