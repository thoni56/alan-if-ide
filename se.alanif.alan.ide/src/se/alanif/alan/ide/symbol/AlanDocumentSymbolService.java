package se.alanif.alan.ide.symbol;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;

import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EStructuralFeature;
import org.eclipse.emf.ecore.EcorePackage;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.util.EcoreUtil;
import org.eclipse.lsp4j.Location;
import org.eclipse.xtext.findReferences.IReferenceFinder;
import org.eclipse.xtext.ide.server.DocumentExtensions;
import org.eclipse.xtext.ide.server.symbol.DocumentSymbolService;
import org.eclipse.xtext.naming.IQualifiedNameConverter;
import org.eclipse.xtext.naming.QualifiedName;
import org.eclipse.xtext.nodemodel.ICompositeNode;
import org.eclipse.xtext.nodemodel.ILeafNode;
import org.eclipse.xtext.nodemodel.INode;
import org.eclipse.xtext.parser.IParseResult;
import org.eclipse.xtext.nodemodel.util.NodeModelUtils;
import org.eclipse.xtext.resource.EObjectAtOffsetHelper;
import org.eclipse.xtext.resource.IEObjectDescription;
import org.eclipse.xtext.resource.IResourceDescriptions;
import org.eclipse.xtext.resource.IResourceDescriptionsProvider;
import org.eclipse.xtext.resource.XtextResource;
import org.eclipse.xtext.util.CancelIndicator;
import org.eclipse.xtext.util.TextRegion;

import com.google.inject.Inject;

import se.alanif.alan.services.AlanGrammarAccess;

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

	@Inject
	private AlanGrammarAccess grammar;

	@Inject
	private IResourceDescriptionsProvider resourceDescriptionsProvider;

	@Inject
	private IQualifiedNameConverter qualifiedNameConverter;

	/** Project-wide index of node-scanned declarations (verbs/scripts/syntax/synonyms),
	 *  keyed by directory and rebuilt when any source file's timestamp changes. */
	private static final Map<Path, NodeIndex> NODE_INDEX = new ConcurrentHashMap<>();

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
		// (a) declarations that ARE in the semantic model (they carry a name=):
		//     Class / Instance / Addition / Event / Import.
		for (Iterator<EObject> it = resource.getAllContents(); it.hasNext();) {
			EObject obj = it.next();
			String declared = nameOf(obj);
			if (declared != null && declared.equalsIgnoreCase(name)) {
				Location loc = documentExtensions.newLocation(obj);
				if (loc != null && !hits.contains(loc)) {
					hits.add(loc);
				}
			}
		}
		// (b) declarations that are NOT in the model (verbs, syntax, scripts,
		//     synonyms) in THIS file -- found by scanning the node model.
		walkNodeDeclarations(parse.getRootNode(), (declared, node) -> {
			if (declared.equalsIgnoreCase(name)) {
				addNodeLocation(resource, node, hits);
			}
		});
		// (c) modelled declarations in OTHER files -- via the global index.
		addCrossFileHits(resource, name, hits);
		// (d) node-scanned declarations in OTHER files -- via our project index.
		addProjectNodeHits(resource, name, hits);
		return hits;
	}

	/**
	 * Cross-file navigation for modelled declarations (class/instance/addition/event
	 * -- the {@code name=} nodes Xtext exports to its global index). Query the index
	 * by name, case-insensitively, and resolve each hit to a location in its own
	 * file. The current file is handled by the live scans above, so it's skipped
	 * here. Node-scanned symbols (verbs/scripts/syntax) aren't in the index; making
	 * those cross-file needs a separate project-wide scan.
	 */
	private void addCrossFileHits(XtextResource resource, String name, List<Location> hits) {
		if (resource.getResourceSet() == null) {
			return;
		}
		IResourceDescriptions index =
				resourceDescriptionsProvider.getResourceDescriptions(resource.getResourceSet());
		if (index == null) {
			return;
		}
		URI current = resource.getURI();
		QualifiedName qn = qualifiedNameConverter.toQualifiedName(name);
		for (IEObjectDescription description :
				index.getExportedObjects(EcorePackage.Literals.EOBJECT, qn, true)) {
			if (current != null && current.equals(description.getEObjectURI().trimFragment())) {
				continue; // this file's declarations already come from the live scan
			}
			EObject obj = EcoreUtil.resolve(description.getEObjectOrProxy(), resource.getResourceSet());
			if (obj == null || obj.eIsProxy()) {
				continue;
			}
			Location loc = documentExtensions.newLocation(obj);
			if (loc != null && !hits.contains(loc)) {
				hits.add(loc);
			}
		}
	}

	/** Receives each node-scanned declaration ({@code name}, defining node). */
	private interface NodeDeclSink {
		void accept(String name, INode node);
	}

	/**
	 * Walk the node model and report declarations that live in datatype rules and so
	 * never reach the semantic model: verb names (a comma-list after 'verb'), the
	 * verb a 'syntax' item defines, script names, and synonym words. Verb is reused
	 * inside class bodies, so modelling it would trigger the typing cascade; instead
	 * we recognise the DECLARING identifier by its grammar element, which distinguishes
	 * e.g. the 'verb' header from 'end verb'. Multi-name verbs fall out naturally.
	 */
	private void walkNodeDeclarations(ICompositeNode root, NodeDeclSink sink) {
		EObject verbNames = grammar.getVerbHeaderAccess().getIdListParserRuleCall_2();
		EObject synonymNames = grammar.getSynonymDeclarationAccess().getIdListParserRuleCall_0();
		EObject scriptName = grammar.getScriptAccess().getAlanIdParserRuleCall_1();
		EObject syntaxName = grammar.getSyntaxItemAccess().getAlanIdParserRuleCall_0();

		for (INode node : root.getAsTreeIterable()) {
			EObject element = node.getGrammarElement();
			if (element == verbNames || element == synonymNames) {
				for (INode child : node.getAsTreeIterable()) {
					if (child instanceof ILeafNode && !((ILeafNode) child).isHidden()) {
						String text = child.getText().trim();
						if (!text.equals(",")) {
							sink.accept(unquote(text), child);
						}
					}
				}
			} else if (element == scriptName || element == syntaxName) {
				sink.accept(unquote(node.getText().trim()), node);
			}
		}
	}

	/**
	 * Cross-file navigation for node-scanned symbols (verbs/scripts/syntax/synonyms),
	 * which aren't in Xtext's index. We keep our own per-directory index of every
	 * such declaration, rebuilt when any source file's timestamp changes, and look
	 * the name up in it. The CURRENT file is served live by the scan above and is
	 * skipped here.
	 */
	private void addProjectNodeHits(XtextResource resource, String name, List<Location> hits) {
		Path dir = dirOf(resource.getURI());
		if (dir == null || resource.getResourceSet() == null) {
			return;
		}
		String currentUri = lspUriOf(resource);
		List<Location> found = nodeIndex(dir, resource.getResourceSet()).get(name.toLowerCase(Locale.ROOT));
		if (found == null) {
			return;
		}
		for (Location loc : found) {
			if (loc.getUri().equals(currentUri) || hits.contains(loc)) {
				continue;
			}
			hits.add(loc);
		}
	}

	/** The project's node-declaration index, cached until a source file changes. */
	private Map<String, List<Location>> nodeIndex(Path dir, org.eclipse.emf.ecore.resource.ResourceSet rs) {
		String signature = signatureOf(dir);
		NodeIndex cached = NODE_INDEX.get(dir);
		if (cached != null && cached.signature.equals(signature)) {
			return cached.byName;
		}
		synchronized (NODE_INDEX) {
			cached = NODE_INDEX.get(dir);
			if (cached != null && cached.signature.equals(signature)) {
				return cached.byName;
			}
			Map<String, List<Location>> map = new HashMap<>();
			try (Stream<Path> files = Files.list(dir)) {
				files.filter(AlanDocumentSymbolService::isAlanSource).forEach(p -> {
					try {
						Resource r = rs.getResource(URI.createFileURI(p.toString()), true);
						if (r instanceof XtextResource) {
							IParseResult parse = ((XtextResource) r).getParseResult();
							if (parse != null && parse.getRootNode() != null) {
								walkNodeDeclarations(parse.getRootNode(), (declared, node) -> {
									if (!declared.isEmpty()) {
										Location loc = documentExtensions.newLocation((XtextResource) r,
												new TextRegion(node.getOffset(), node.getLength()));
										if (loc != null) {
											map.computeIfAbsent(declared.toLowerCase(Locale.ROOT),
													k -> new ArrayList<>()).add(loc);
										}
									}
								});
							}
						}
					} catch (RuntimeException ignored) {
						// unreadable/unparseable file -- skip it
					}
				});
			} catch (IOException ignored) {
				// directory gone -- return whatever we have
			}
			NODE_INDEX.put(dir, new NodeIndex(signature, map));
			return map;
		}
	}

	private String lspUriOf(XtextResource resource) {
		Location probe = documentExtensions.newLocation(resource, new TextRegion(0, 0));
		return probe == null ? null : probe.getUri();
	}

	private static Path dirOf(URI uri) {
		if (uri == null || !uri.isFile()) {
			return null;
		}
		try {
			return Paths.get(uri.toFileString()).getParent();
		} catch (RuntimeException e) {
			return null;
		}
	}

	private static boolean isAlanSource(Path p) {
		String n = p.getFileName().toString().toLowerCase(Locale.ROOT);
		return n.endsWith(".alan") || n.endsWith(".i");
	}

	/** A signature of all Alan source files in a directory (name + last-modified). */
	private static String signatureOf(Path dir) {
		try (Stream<Path> files = Files.list(dir)) {
			StringBuilder sb = new StringBuilder();
			files.filter(AlanDocumentSymbolService::isAlanSource).sorted().forEach(p -> {
				sb.append(p.getFileName());
				try {
					sb.append(':').append(Files.getLastModifiedTime(p).toMillis());
				} catch (IOException e) {
					sb.append(":0");
				}
				sb.append('|');
			});
			return sb.toString();
		} catch (IOException e) {
			return "";
		}
	}

	private static final class NodeIndex {
		final String signature;
		final Map<String, List<Location>> byName;

		NodeIndex(String signature, Map<String, List<Location>> byName) {
			this.signature = signature;
			this.byName = byName;
		}
	}

	private void addNodeLocation(XtextResource resource, INode node, List<Location> hits) {
		Location loc = documentExtensions.newLocation(resource,
				new TextRegion(node.getOffset(), node.getLength()));
		if (loc != null && !hits.contains(loc)) {
			hits.add(loc);
		}
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
