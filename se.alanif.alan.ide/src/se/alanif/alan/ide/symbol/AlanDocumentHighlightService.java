package se.alanif.alan.ide.symbol;

import java.util.ArrayList;
import java.util.List;

import org.eclipse.lsp4j.DocumentHighlight;
import org.eclipse.lsp4j.DocumentHighlightKind;
import org.eclipse.lsp4j.Location;
import org.eclipse.xtext.ide.server.occurrences.DefaultDocumentHighlightService;
import org.eclipse.xtext.resource.XtextResource;

import com.google.inject.Inject;

/**
 * Highlight the other occurrences of the name under the cursor.
 *
 * <p>Xtext's default is model-based, and Alan's reference sites live in the
 * datatype-only subtree with no cross-references, so it returned nothing at all --
 * resting the cursor on a name did nothing, in a language where the same word can
 * mean a loop variable here and an instance three lines later.
 *
 * <p>It shares the resolver that go-to-definition and find-references use, so all
 * three agree: inside a loop, only that loop's uses light up; outside it, only the
 * global's. Highlighting is per-document by definition, which is the one way it
 * differs -- it never leaves the file.
 */
public class AlanDocumentHighlightService extends DefaultDocumentHighlightService {

	@Inject
	private AlanDocumentSymbolService symbols;

	@Override
	public List<DocumentHighlight> getDocumentHighlights(XtextResource resource, int offset) {
		AlanDocumentSymbolService.Occurrences found = symbols.occurrencesInDocument(resource, offset);
		List<DocumentHighlight> highlights = new ArrayList<>();
		for (Location hit : found.all) {
			// The binder gets Write so it reads as the place the name comes from; VS
			// Code renders the two differently, which is most of the value when one
			// word means different things a few lines apart.
			boolean isDeclaration = found.declarations.stream()
					.anyMatch(d -> d.getRange().equals(hit.getRange()));
			highlights.add(new DocumentHighlight(hit.getRange(),
					isDeclaration ? DocumentHighlightKind.Write : DocumentHighlightKind.Read));
		}
		return highlights;
	}
}
