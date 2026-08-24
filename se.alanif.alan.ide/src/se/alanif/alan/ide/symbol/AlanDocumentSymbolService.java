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
import org.eclipse.xtext.Keyword;
import org.eclipse.xtext.RuleCall;
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
		// RUNG 1 -- LEXICAL LOCALS SHADOW EVERYTHING GLOBAL. A loop variable or 'this'
		// is bound by the text around it, so a global of the same name is simply the
		// wrong answer. Returning here rather than merging is the whole point: this
		// establishes the resolution ORDER that verb parameters (rung 2) and the type
		// model (rung 3) will extend.
		//
		// null means "not a local matter, carry on"; an EMPTY list means "local, and
		// deliberately no target" -- see 'current actor' below.
		List<Location> lexical = lexicalDefinitions(resource, offset);
		if (lexical != null) {
			return lexical;
		}

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
	 * Resolve an identifier that is bound lexically rather than declared globally.
	 *
	 * <p>Alan's statements live in datatype-only rules, so none of this reaches the
	 * semantic model and the walk is over the NODE model. Ancestor nodes carry the
	 * {@link RuleCall} that invoked a rule, not the rule itself, which is why the
	 * enclosing loop is recognised by the rule its call points at.
	 *
	 * @return the binder's location; an empty list to mean "resolved, no target";
	 *         or null to mean "not lexical -- fall through to the global search".
	 */
	private List<Location> lexicalDefinitions(XtextResource resource, int offset) {
		if (resource.getParseResult() == null) {
			return null;
		}
		ILeafNode leaf = NodeModelUtils.findLeafNodeAtOffset(
				resource.getParseResult().getRootNode(), offset);
		if (leaf == null || leaf.isHidden()) {
			return null;
		}
		String name = unquote(leaf.getText().trim());
		if (name.isEmpty()) {
			return null;
		}

		if ("this".equalsIgnoreCase(name)) {
			return enclosingEntityDefinition(resource, leaf);
		}
		// 'current actor' / 'current location' are RUNTIME context, not lexical
		// bindings -- there is no declaration to jump to. Resolving them to nothing is
		// the useful answer: without this the name-based pass would happily jump to
		// whatever global happens to be called 'actor'.
		if (isCurrentPhrase(leaf, name)) {
			return Collections.emptyList();
		}

		EObject binderCall = grammar.getRepetitionStatementAccess().getAlanIdParserRuleCall_1();

		// Standing on the binder itself: answer with it, so that the declaration of a
		// loop variable does not fall through and jump to a same-named global.
		for (INode n = leaf; n != null && n != resource.getParseResult().getRootNode(); n = n.getParent()) {
			if (n.getGrammarElement() == binderCall) {
				return locationOf(resource, n);
			}
		}

		// Otherwise walk outwards; the innermost enclosing loop that binds this name
		// wins, which gives correct shadowing for nested loops at no extra cost.
		for (INode n = leaf.getParent(); n != null; n = n.getParent()) {
			if (!isRuleCallTo(n.getGrammarElement(), grammar.getRepetitionStatementRule())) {
				continue;
			}
			for (INode child : ((ICompositeNode) n).getChildren()) {
				if (child.getGrammarElement() == binderCall
						&& name.equalsIgnoreCase(unquote(child.getText().trim()))) {
					return locationOf(resource, child);
				}
			}
		}
		return null;
	}

	/** 'this' means the class or instance whose body encloses it. */
	private List<Location> enclosingEntityDefinition(XtextResource resource, INode leaf) {
		for (INode n = leaf; n != null; n = n.getParent()) {
			EObject semantic = n.hasDirectSemanticElement() ? n.getSemanticElement() : null;
			if (semantic instanceof se.alanif.alan.alan.Class
					|| semantic instanceof se.alanif.alan.alan.Instance
					|| semantic instanceof se.alanif.alan.alan.Addition) {
				List<INode> nameNodes =
						NodeModelUtils.findNodesForFeature(semantic,
								semantic.eClass().getEStructuralFeature("name"));
				if (!nameNodes.isEmpty()) {
					return locationOf(resource, nameNodes.get(0));
				}
			}
		}
		return Collections.emptyList();   // 'this' outside any entity: no target, but not global either
	}

	/** True for the 'actor'/'location' of a 'current actor' / 'current location'. */
	private boolean isCurrentPhrase(ILeafNode leaf, String name) {
		if ("current".equalsIgnoreCase(name)) {
			return true;
		}
		if (!"actor".equalsIgnoreCase(name) && !"location".equalsIgnoreCase(name)) {
			return false;
		}
		for (INode n = leaf.getParent(); n != null; n = n.getParent()) {
			if (isRuleCallTo(n.getGrammarElement(), grammar.getSimpleWhatRule())) {
				return n.getText().trim().toLowerCase().startsWith("current");
			}
		}
		return false;
	}

	private static boolean isRuleCallTo(EObject grammarElement, EObject rule) {
		return grammarElement instanceof RuleCall && ((RuleCall) grammarElement).getRule() == rule;
	}

	private List<Location> locationOf(XtextResource resource, INode node) {
		List<Location> single = new ArrayList<>(1);
		addNodeLocation(resource, node, single);
		return single;
	}

	/**
	 * Find-references, interim by-name flavour. Alan's reference sites (every
	 * {@code locate}/{@code describe}/exit/expression mention) live in the
	 * datatype-only subtree and aren't modelled as cross-references, so Xtext's
	 * model-based finder returns nothing. Instead we resolve the identifier under
	 * the cursor to a name and return EVERY occurrence of that identifier -- across
	 * every source file in the directory -- matched case-insensitively (Alan folds
	 * case). Declarations and usages both show up, which is what an author wants
	 * from "Find All References". It's an approximation: it's name-scoped, so two
	 * unrelated things sharing a name would be listed together. Precise references
	 * need the full semantic model.
	 */
	@Override
	public List<? extends Location> getReferences(XtextResource resource, int offset,
			IReferenceFinder.IResourceAccess resourceAccess, IResourceDescriptions indexData,
			CancelIndicator cancelIndicator) {
		String name = nameUnderCursor(resource, offset);
		if (name == null) {
			return Collections.emptyList();
		}
		List<Location> hits = new ArrayList<>();
		collectNameOccurrences(resource, name, hits);

		Path dir = dirOf(resource.getURI());
		if (dir != null && resource.getResourceSet() != null) {
			URI current = resource.getURI();
			try (Stream<Path> files = Files.list(dir)) {
				files.filter(AlanDocumentSymbolService::isAlanSource).forEach(p -> {
					URI uri = URI.createFileURI(p.toString());
					if (uri.equals(current)) {
						return; // current file already scanned live above
					}
					try {
						Resource r = resource.getResourceSet().getResource(uri, true);
						if (r instanceof XtextResource) {
							collectNameOccurrences((XtextResource) r, name, hits);
						}
					} catch (RuntimeException ignored) {
						// unreadable/unparseable file -- skip it
					}
				});
			} catch (IOException ignored) {
				// directory gone -- return whatever we have
			}
		}
		return hits;
	}

	/** Add every non-hidden identifier leaf in {@code resource} whose (unquoted)
	 *  text case-insensitively equals {@code name}. Keywords, comments, whitespace
	 *  and string literals are skipped, so only real identifier mentions match. */
	private void collectNameOccurrences(XtextResource resource, String name, List<Location> hits) {
		IParseResult parse = resource.getParseResult();
		if (parse == null || parse.getRootNode() == null) {
			return;
		}
		for (INode node : parse.getRootNode().getAsTreeIterable()) {
			if (!(node instanceof ILeafNode)) {
				continue;
			}
			ILeafNode leaf = (ILeafNode) node;
			if (leaf.isHidden() || leaf.getGrammarElement() instanceof Keyword) {
				continue;
			}
			if (unquote(leaf.getText().trim()).equalsIgnoreCase(name)) {
				addNodeLocation(resource, leaf, hits);
			}
		}
	}

	/** The (unquoted, non-empty) identifier text under the cursor, or null. */
	private String nameUnderCursor(XtextResource resource, int offset) {
		IParseResult parse = resource.getParseResult();
		if (parse == null || parse.getRootNode() == null) {
			return null;
		}
		ILeafNode leaf = NodeModelUtils.findLeafNodeAtOffset(parse.getRootNode(), offset);
		if (leaf == null || leaf.isHidden()) {
			return null;
		}
		String name = unquote(leaf.getText().trim());
		return name.isEmpty() ? null : name;
	}

	/**
	 * Fallback: jump to any declaration whose {@code name} equals the identifier
	 * under the cursor (case-insensitive). Returns every match -- if a name is both
	 * an instance and an 'add to', the client offers both.
	 */
	private List<? extends Location> nameBasedDefinitions(XtextResource resource, int offset) {
		String name = nameUnderCursor(resource, offset);
		if (name == null) {
			return Collections.emptyList();
		}
		IParseResult parse = resource.getParseResult();

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
