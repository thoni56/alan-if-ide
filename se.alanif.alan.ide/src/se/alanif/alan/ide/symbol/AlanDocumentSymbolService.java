package se.alanif.alan.ide.symbol;

import java.util.Collections;
import java.util.List;

import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.lsp4j.Location;
import org.eclipse.xtext.findReferences.IReferenceFinder;
import org.eclipse.xtext.ide.server.symbol.DocumentSymbolService;
import org.eclipse.xtext.resource.EObjectAtOffsetHelper;
import org.eclipse.xtext.resource.XtextResource;
import org.eclipse.xtext.util.CancelIndicator;

import com.google.inject.Inject;

/**
 * Go-to-definition that degrades gracefully for the built-in prelude.
 *
 * The predefined classes (entity/thing/object/...) live in the synthetic,
 * fileless resource {@code synthetic:/alan/builtins.alan} (see AlanScopeProvider).
 * The base definition handler resolves the target under the cursor, then asks the
 * WORKSPACE resource access to load the target's resource to locate it -- but a
 * synthetic URI has no file to load, so the load throws and the client shows
 * "Request textDocument/definition failed".
 *
 * We intercept before that: if the cursor resolves onto a built-in, return no
 * definition (a clean "Definition not found") instead of erroring. Real
 * user-declared targets fall through to the default behaviour unchanged.
 */
public class AlanDocumentSymbolService extends DocumentSymbolService {

	@Inject
	private EObjectAtOffsetHelper offsetHelper;

	@Override
	public List<? extends Location> getDefinitions(XtextResource resource, int offset,
			IReferenceFinder.IResourceAccess resourceAccess, CancelIndicator cancelIndicator) {
		EObject target = offsetHelper.getElementWithNameAt(resource, offset);
		if (isSynthetic(target)) {
			return Collections.emptyList();
		}
		return super.getDefinitions(resource, offset, resourceAccess, cancelIndicator);
	}

	private static boolean isSynthetic(EObject e) {
		if (e == null) {
			return false;
		}
		Resource r = e.eResource();
		return r != null && r.getURI() != null && "synthetic".equals(r.getURI().scheme());
	}
}
