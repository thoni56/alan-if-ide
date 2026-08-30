package se.alanif.alan.ide.formatting;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.xtext.parser.IParseResult;
import org.eclipse.xtext.resource.XtextResource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.google.inject.Injector;

import se.alanif.alan.formatting.AlanStructuralFormatter;
import se.alanif.alan.formatting.AlanStructuralFormatter.KeywordCase;
import se.alanif.alan.ide.AlanIdeSetup;

/**
 * Format a real game twice and get the same thing back.
 *
 * <p>The handwritten tests say what each rule does; this says that the rules together
 * do not fight. An author formats, edits, formats again -- and a file that drifts on
 * every save would be the worst bug this component could have, because it would look
 * like the editor quietly disagreeing with itself.
 *
 * <p>SKIPPED WHEN THE CORPUS IS ABSENT, which includes CI: the game is not ours to
 * vendor, and 83 real files exercise more shapes than anything we would invent. Point
 * {@code -Dalan.corpus=...} at any directory of Alan sources; it defaults to the
 * Wyldkynd project, the 80-file game this formatter was developed against.
 */
class CorpusStabilityTest {

	@Test
	@DisplayName("formatting every file of a real game is stable on the second pass")
	void theCorpusIsStable() throws Exception {
		Path corpus = Path.of(System.getProperty("alan.corpus",
				Path.of(System.getProperty("user.home"), "Utveckling", "wyldkynd").toString()));
		assumeTrue(Files.isDirectory(corpus), "no corpus at " + corpus + " -- skipping");

		Injector injector = new AlanIdeSetup().createInjectorAndDoEMFRegistration();
		List<String> drifted = new ArrayList<>();
		int checked = 0;

		List<Path> files;
		try (Stream<Path> found = Files.walk(corpus)) {
			files = found.filter(CorpusStabilityTest::isAlanSource).sorted().toList();
		}

		for (Path file : files) {
			// Read as ISO-8859-1: every byte maps to a character, so a file in any
			// single-byte encoding still yields text we can format. What is under test
			// is layout, and layout is ASCII.
			String source = new String(Files.readAllBytes(file), StandardCharsets.ISO_8859_1);
			String once = format(injector, source);
			if (once == null) {
				continue;   // does not parse; the service would not format it either
			}
			checked++;
			if (!once.equals(format(injector, once))) {
				drifted.add(file.getFileName().toString());
			}
		}

		assertEquals(List.of(), drifted, "formatting these files drifted on a second pass");
		assumeTrue(checked > 0, "the corpus held no parseable Alan sources");
	}

	private static boolean isAlanSource(Path path) {
		String name = path.getFileName().toString().toLowerCase();
		return name.endsWith(".alan") || name.endsWith(".i");
	}

	private String format(Injector injector, String source) throws Exception {
		ResourceSet resources = injector.getInstance(ResourceSet.class);
		Path file = Files.createTempDirectory("alan-corpus").resolve("f.alan");
		XtextResource resource =
				(XtextResource) resources.createResource(URI.createFileURI(file.toString()));
		resource.load(new ByteArrayInputStream(source.getBytes(StandardCharsets.UTF_8)), null);
		IParseResult parse = resource.getParseResult();
		if (parse == null || parse.getRootNode() == null
				|| parse.getSyntaxErrors().iterator().hasNext()) {
			return null;
		}
		return new AlanStructuralFormatter().format(parse, source, "\t", 4, KeywordCase.OFF);
	}
}
