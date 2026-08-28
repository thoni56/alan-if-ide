package se.alanif.alan.ide.symbol;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.lsp4j.Location;
import org.eclipse.xtext.findReferences.IReferenceFinder;
import org.eclipse.xtext.resource.XtextResource;
import org.eclipse.xtext.util.CancelIndicator;
import org.eclipse.xtext.util.concurrent.IUnitOfWork;

import com.google.inject.Injector;

import se.alanif.alan.ide.AlanIdeSetup;

/**
 * A parsed Alan program you can ask navigation questions about.
 *
 * <p>Written for the answers that matter, which are almost all NEGATIVE: not "does
 * `obj` resolve" but "does it resolve to the parameter RATHER THAN the instance of the
 * same name". Those rules were each checked once, by hand, on the day they were
 * written -- and a later change silently broke one, which is what this exists to stop.
 *
 * <p>Positions are marked in the source with {@code <1>}, {@code <2>} and so on,
 * immediately before the token of interest. The markers are stripped before parsing,
 * so the program is real Alan and the test reads as the program rather than as
 * arithmetic over {@code indexOf}.
 */
final class NavigationFixture {

	private static final Pattern MARKER = Pattern.compile("<(\\d+)>");

	private final XtextResource resource;
	private final AlanDocumentSymbolService symbols;
	private final AlanDocumentHighlightService highlights;
	private final IReferenceFinder.IResourceAccess access;
	private final List<Integer> offsets = new ArrayList<>();
	private final String source;
	private final Path directory;

	private NavigationFixture(String marked) throws Exception {
		StringBuilder plain = new StringBuilder();
		Matcher m = MARKER.matcher(marked);
		int last = 0;
		while (m.find()) {
			plain.append(marked, last, m.start());
			int index = Integer.parseInt(m.group(1));
			while (offsets.size() <= index) {
				offsets.add(-1);
			}
			offsets.set(index, plain.length());
			last = m.end();
		}
		plain.append(marked.substring(last));
		this.source = plain.toString();

		Path file = Files.createTempDirectory("alan-nav").resolve("test.alan");
		Files.writeString(file, source);
		this.directory = file.getParent();

		Injector injector = new AlanIdeSetup().createInjectorAndDoEMFRegistration();
		ResourceSet resources = injector.getInstance(ResourceSet.class);
		this.resource = (XtextResource) resources.createResource(URI.createFileURI(file.toString()));
		this.resource.load(new java.io.ByteArrayInputStream(source.getBytes("UTF-8")), null);
		this.symbols = injector.getInstance(AlanDocumentSymbolService.class);
		this.highlights = injector.getInstance(AlanDocumentHighlightService.class);
		this.access = new IReferenceFinder.IResourceAccess() {
			@Override
			public <R> R readOnly(URI uri, IUnitOfWork<R, ResourceSet> work) {
				try {
					return work.exec(resources);
				} catch (Exception e) {
					throw new RuntimeException(e);
				}
			}
		};
	}

	/** Where the sources are, so a test can take the directory away underneath us. */
	Path directory() {
		return directory;
	}

	static NavigationFixture of(String... markedLines) throws Exception {
		return new NavigationFixture(String.join("\n", markedLines) + "\n");
	}

	/** 1-based lines that Go to Definition offers at marker {@code n}, in order. */
	List<Integer> definitionsAt(int n) {
		return lines(symbols.getDefinitions(resource, offsets.get(n), access, CancelIndicator.NullImpl));
	}

	/** 1-based lines that Find All References offers at marker {@code n}, sorted. */
	List<Integer> referencesAt(int n) {
		List<Integer> found = lines(symbols.getReferences(
				resource, offsets.get(n), access, null, CancelIndicator.NullImpl));
		found.sort(Integer::compareTo);
		return found;
	}

	/** 1-based lines highlighted at marker {@code n}, sorted. */
	List<Integer> highlightsAt(int n) {
		List<Integer> found = new ArrayList<>();
		highlights.getDocumentHighlights(resource, offsets.get(n))
				.forEach(h -> found.add(h.getRange().getStart().getLine() + 1));
		found.sort(Integer::compareTo);
		return found;
	}

	/** 1-based lines highlighted as DECLARATIONS (Write) at marker {@code n}, sorted. */
	List<Integer> declarationsAt(int n) {
		List<Integer> found = new ArrayList<>();
		highlights.getDocumentHighlights(resource, offsets.get(n)).forEach(h -> {
			if (h.getKind() == org.eclipse.lsp4j.DocumentHighlightKind.Write) {
				found.add(h.getRange().getStart().getLine() + 1);
			}
		});
		found.sort(Integer::compareTo);
		return found;
	}

	/** The text of a 1-based line, for failure messages that say what was found. */
	String line(int number) {
		return source.split("\n", -1)[number - 1].trim();
	}

	private static List<Integer> lines(List<? extends Location> locations) {
		List<Integer> found = new ArrayList<>();
		if (locations != null) {
			for (Location location : locations) {
				found.add(location.getRange().getStart().getLine() + 1);
			}
		}
		return found;
	}
}
