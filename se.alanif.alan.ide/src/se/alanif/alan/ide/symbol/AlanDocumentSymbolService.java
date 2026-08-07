package se.alanif.alan.ide.symbol;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;

import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EStructuralFeature;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.lsp4j.Location;
import org.eclipse.xtext.findReferences.IReferenceFinder;
import org.eclipse.xtext.ide.server.DocumentExtensions;
import org.eclipse.xtext.ide.server.symbol.DocumentSymbolService;
import org.eclipse.xtext.nodemodel.ILeafNode;
import org.eclipse.xtext.parser.IParseResult;
import org.eclipse.xtext.nodemodel.util.NodeModelUtils;
import org.eclipse.xtext.resource.EObjectAtOffsetHelper;
import org.eclipse.xtext.resource.XtextResource;
import org.eclipse.xtext.util.CancelIndicator;

import com.google.inject.Inject;

/**
 * Go-to-definition for Alan, with two behaviours the base handler lacks.
 *
 * <p>1. GRACEFUL BUILT-INS: the predefined classes live in the fileless
 * synthetic prelude resource (see AlanScopeProvider). The base handler would try
 * to LOAD that resource to locate the target and throw
 * "Request textDocument/definition failed"; we return no definition instead.
 *
 * <p>2. NAME-BASED ENTITY REFERENCES: instances/classes/events are referenced
 * all over expressions and statements ({@code locate}, {@code describe},
 * {@code schedule}, exits, ...). Those reference sites live in the datatype-only
 * expression subtree, so they are NOT modelled as cross-references (modelling
 * them would drag the whole subtree into the semantic model). Instead we resolve
 * by NAME: the token under the cursor is matched, case-insensitively (Alan folds
 * case), against every declared {@code name=} node in the resource. This gives
 * go-to-definition from every reference site with no grammar changes and no false
 * errors -- a non-matching token (a parameter, a loop variable, a keyword) simply
 * yields no definition. Find-references/rename would need the full model.
 */
public class AlanDocumentSymbolService extends DocumentSymbolService {

	@Inject
	private EObjectAtOffsetHelper offsetHelper;

	@Inject
	private DocumentExtensions documentExtensions;

	@Override
	public List<? extends Location> getDefinitions(XtextResource resource, int offset,
			IReferenceFinder.IResourceAccess resourceAccess, CancelIndicator cancelIndicator) {
		EObject target = offsetHelper.getElementWithNameAt(resource, offset);
		List<Location> results = new ArrayList<>();

		// Modelled cross-reference target(s) -- e.g. 'isa' -> Class. Skipped when the
		// target is the fileless synthetic prelude (super would try to load it and
		// throw "Request textDocument/definition failed").
		if (!isSynthetic(target)) {
			List<? extends Location> modelled =
					super.getDefinitions(resource, offset, resourceAccess, cancelIndicator);
			if (modelled != null) {
				results.addAll(modelled);
			}
		}

		// ALSO add every same-named declaration, deduped. Alan spreads one logical
		// entity across sites (an 'every'/'the' plus its 'add to' additions), so
		// go-to-definition should list ALL the parts -- matching what Find-References
		// already shows. Merging (not just falling back) is what makes the addition
		// appear even on an 'isa' target, where the modelled path alone yields only
		// the class.
		for (Location loc : nameBasedDefinitions(resource, offset)) {
			if (!results.contains(loc)) {
				results.add(loc);
			}
		}
		return results;
	}

	/**
	 * Fallback: jump to any declaration whose {@code name} equals the identifier
	 * under the cursor (case-insensitive). Returns every match -- if a name is both
	 * an instance and an 'add to', the client offers both.
	 */
	private List<? extends Location> nameBasedDefinitions(XtextResource resource, int offset) {
		IParseResult parse = resource.getParseResult();
		if (parse == null || parse.getRootNode() == null) {
			return Collections.emptyList();
		}
		ILeafNode leaf = NodeModelUtils.findLeafNodeAtOffset(parse.getRootNode(), offset);
		if (leaf == null || leaf.isHidden()) {
			return Collections.emptyList();
		}
		String name = unquote(leaf.getText().trim());
		if (name.isEmpty()) {
			return Collections.emptyList();
		}

		List<Location> hits = new ArrayList<>();
		for (Iterator<EObject> it = resource.getAllContents(); it.hasNext();) {
			EObject obj = it.next();
			String declared = nameOf(obj);
			if (declared != null && declared.equalsIgnoreCase(name)) {
				Location loc = documentExtensions.newLocation(obj);
				if (loc != null) {
					hits.add(loc);
				}
			}
		}
		return hits;
	}

	/** The String value of an EObject's {@code name} feature, or null. */
	private static String nameOf(EObject obj) {
		EStructuralFeature feature = obj.eClass().getEStructuralFeature("name");
		if (feature == null || feature.isMany() || !(feature.getEType().getInstanceClass() == String.class)) {
			return null;
		}
		Object value = obj.eGet(feature);
		return value instanceof String ? (String) value : null;
	}

	/** Strip surrounding single quotes and collapse '' -> ', matching AlanId. */
	private static String unquote(String text) {
		if (text.length() >= 2 && text.charAt(0) == '\'' && text.charAt(text.length() - 1) == '\'') {
			return text.substring(1, text.length() - 1).replace("''", "'");
		}
		return text;
	}

	private static boolean isSynthetic(EObject e) {
		if (e == null) {
			return false;
		}
		Resource r = e.eResource();
		return r != null && r.getURI() != null && "synthetic".equals(r.getURI().scheme());
	}
}
