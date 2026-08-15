package se.alanif.alan.ide.symbol;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EStructuralFeature;
import org.eclipse.lsp4j.DocumentSymbol;
import org.eclipse.lsp4j.DocumentSymbolParams;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.SymbolKind;
import org.eclipse.xtext.ide.server.Document;
import org.eclipse.xtext.ide.server.symbol.HierarchicalDocumentSymbolService;
import org.eclipse.xtext.nodemodel.ICompositeNode;
import org.eclipse.xtext.nodemodel.ILeafNode;
import org.eclipse.xtext.nodemodel.INode;
import org.eclipse.xtext.nodemodel.util.NodeModelUtils;
import org.eclipse.xtext.parser.IParseResult;
import org.eclipse.xtext.resource.XtextResource;
import org.eclipse.xtext.util.CancelIndicator;

import com.google.inject.Inject;

import se.alanif.alan.services.AlanGrammarAccess;

/**
 * The document outline for Alan.
 *
 * <p>The stock outline walks the semantic model only, which for Alan's SHALLOW
 * model means it shows just the {@code name=}-carrying EObjects (classes,
 * instances, additions, events, imports) and MISSES verbs, syntax items, scripts
 * and synonyms -- all of which live in datatype rules and reach only the node
 * model. It also gives every entry the same generic icon.
 *
 * <p>This service builds a COMPLETE, well-kinded, source-ordered tree from two
 * sources: the model (for the reliably-named declarations) and a node-model scan
 * (for the datatype-only declarations, the same technique used for navigation).
 * Verbs and scripts are NESTED under the class/instance/addition whose text region
 * contains them (a verb defined inside {@code every clothing ... end verb} becomes
 * a child of that class); everything else is top-level in source order. Each kind
 * gets a distinct {@link SymbolKind} so VS Code renders a recognisable icon.
 */
public class AlanHierarchicalDocumentSymbolService extends HierarchicalDocumentSymbolService {

	@Inject
	private AlanGrammarAccess grammar;

	/** A top-level container symbol plus the source region it owns, for nesting. */
	private static final class Container {
		final int start;
		final int end;
		final DocumentSymbol symbol;

		Container(int start, int end, DocumentSymbol symbol) {
			this.start = start;
			this.end = end;
			this.symbol = symbol;
		}

		boolean contains(int offset) {
			return start <= offset && offset < end;
		}
	}

	@Override
	public List<DocumentSymbol> getSymbols(Document document, XtextResource resource,
			DocumentSymbolParams params, CancelIndicator cancelIndicator) {
		IParseResult parse = resource.getParseResult();
		if (parse == null || parse.getRootNode() == null || resource.getContents().isEmpty()) {
			return new ArrayList<>();
		}

		List<DocumentSymbol> top = new ArrayList<>();
		List<Container> containers = new ArrayList<>();

		// 1. Named declarations from the model: reliable names + regions. Class/
		//    instance/addition become nesting containers; event/import are leaves.
		EObject adventure = resource.getContents().get(0);
		for (EObject child : adventure.eContents()) {
			SymbolKind kind = modelKind(child.eClass().getName());
			if (kind == null) {
				continue; // unnamed group (syntax/synonyms/messages/rule/prompt) -- handled by the scan
			}
			ICompositeNode node = NodeModelUtils.findActualNodeFor(child);
			if (node == null) {
				continue;
			}
			String name = unquote(nameOf(child));
			if (name.isEmpty()) {
				continue;
			}
			Range full = range(document, node.getOffset(), node.getEndOffset());
			Range sel = nameRange(document, child, full);
			DocumentSymbol sym = new DocumentSymbol(name, kind, full, sel);
			sym.setDetail(detailFor(kind));
			sym.setChildren(new ArrayList<>());
			top.add(sym);
			if (isContainerKind(kind)) {
				containers.add(new Container(node.getOffset(), node.getEndOffset(), sym));
			}
		}

		// 2. Datatype-only declarations from the node model. Verbs and scripts nest
		//    into their owning container; syntax items and synonyms stay top-level.
		scanNodeDeclarations(parse.getRootNode(), (name, kind, nestable, node) -> {
			Range r = range(document, node.getOffset(), node.getEndOffset());
			DocumentSymbol sym = new DocumentSymbol(unquote(name), kind, r, r);
			sym.setDetail(detailFor(kind));
			List<DocumentSymbol> bucket = top;
			if (nestable) {
				Container owner = enclosing(containers, node.getOffset());
				if (owner != null) {
					bucket = owner.symbol.getChildren();
				}
			}
			bucket.add(sym);
		});

		sortByStart(top);
		for (Container c : containers) {
			sortByStart(c.symbol.getChildren());
		}
		return top;
	}

	// Icon note: VS Code renders each SymbolKind with a FIXED codicon, and several
	// kinds share one glyph (Object/Namespace/Module all show as '{}', Method and
	// Function are near-identical). So kinds below are chosen for a DISTINCT, telling
	// icon, not for a literal type-theoretic match -- a couple (script=Constant,
	// synonym=Operator) are picked purely for the glyph.
	private static final SymbolKind KIND_CLASS    = SymbolKind.Class;     // every X
	private static final SymbolKind KIND_INSTANCE = SymbolKind.Variable;  // the X   -- a concrete world object
	private static final SymbolKind KIND_ADDITION = SymbolKind.Interface; // add to X -- augments a class
	private static final SymbolKind KIND_EVENT    = SymbolKind.Event;
	private static final SymbolKind KIND_IMPORT   = SymbolKind.File;      // an import IS a file
	private static final SymbolKind KIND_VERB     = SymbolKind.Method;    // an action
	private static final SymbolKind KIND_SCRIPT   = SymbolKind.Array;     // an ordered list of steps ([] glyph)
	private static final SymbolKind KIND_SYNTAX   = SymbolKind.Key;       // the player's command keyword
	private static final SymbolKind KIND_SYNONYM  = SymbolKind.Constant;  // 'a,b = c' (stacked-bars, nearest to '=')

	/** SymbolKind for a model EClass that carries a name, or null if it has none. */
	private SymbolKind modelKind(String eClassName) {
		switch (eClassName) {
			case "Class":    return KIND_CLASS;
			case "Instance": return KIND_INSTANCE;
			case "Addition": return KIND_ADDITION;
			case "Event":    return KIND_EVENT;
			case "Import":   return KIND_IMPORT;
			default:         return null; // unnamed group (syntax/synonyms/messages/rule/prompt)
		}
	}

	/** Class/instance/addition regions become the nesting parents for verbs/scripts. */
	private static boolean isContainerKind(SymbolKind kind) {
		return kind == KIND_CLASS || kind == KIND_INSTANCE || kind == KIND_ADDITION;
	}

	/**
	 * The Alan word for a kind, shown as the symbol's {@code detail} (dimmed inline
	 * text, and in breadcrumbs / the go-to-symbol pick). We choose SymbolKinds for
	 * their ICON, so the kind's own name (e.g. "Array" for a script) is misleading;
	 * this puts the real term back in front of the author. 1:1 because every Alan
	 * concept maps to a distinct kind above.
	 */
	private static String detailFor(SymbolKind kind) {
		if (kind == KIND_CLASS)    return "class";
		if (kind == KIND_INSTANCE) return "instance";
		if (kind == KIND_ADDITION) return "addition";
		if (kind == KIND_EVENT)    return "event";
		if (kind == KIND_IMPORT)   return "import";
		if (kind == KIND_VERB)     return "verb";
		if (kind == KIND_SCRIPT)   return "script";
		if (kind == KIND_SYNTAX)   return "syntax";
		if (kind == KIND_SYNONYM)  return "synonym";
		return "";
	}

	/** Receives each node-scanned declaration. {@code nestable} verbs/scripts sink
	 *  into their enclosing class/instance/addition; others stay top-level. */
	private interface DeclSink {
		void accept(String name, SymbolKind kind, boolean nestable, INode node);
	}

	/**
	 * Walk the node model and report the declarations that never reach the semantic
	 * model: verb names (a comma-list after 'verb'), syntax-item names, script names
	 * and synonym words. The DECLARING identifier is recognised by its grammar
	 * element (distinguishing e.g. the 'verb' header from 'end verb'); multi-name
	 * verbs and synonyms fall out naturally. Mirrors the navigation service's scan.
	 */
	private void scanNodeDeclarations(ICompositeNode root, DeclSink sink) {
		EObject verbNames = grammar.getVerbHeaderAccess().getIdListParserRuleCall_2();
		EObject synonymNames = grammar.getSynonymDeclarationAccess().getIdListParserRuleCall_0();
		EObject scriptName = grammar.getScriptAccess().getAlanIdParserRuleCall_1();
		EObject syntaxName = grammar.getSyntaxItemAccess().getAlanIdParserRuleCall_0();

		for (INode node : root.getAsTreeIterable()) {
			EObject element = node.getGrammarElement();
			if (element == verbNames || element == synonymNames) {
				boolean isVerb = element == verbNames;
				SymbolKind kind = isVerb ? KIND_VERB : KIND_SYNONYM;
				for (INode child : node.getAsTreeIterable()) {
					if (child instanceof ILeafNode && !((ILeafNode) child).isHidden()) {
						String text = child.getText().trim();
						if (!text.isEmpty() && !text.equals(",")) {
							sink.accept(text, kind, isVerb, child); // verbs nest; synonyms don't
						}
					}
				}
			} else if (element == scriptName) {
				sink.accept(node.getText().trim(), KIND_SCRIPT, true, node); // scripts nest
			} else if (element == syntaxName) {
				sink.accept(node.getText().trim(), KIND_SYNTAX, false, node);
			}
		}
	}

	/** The innermost container whose region holds {@code offset}, or null (global). */
	private Container enclosing(List<Container> containers, int offset) {
		Container best = null;
		for (Container c : containers) {
			if (c.contains(offset) && (best == null || c.start > best.start)) {
				best = c;
			}
		}
		return best;
	}

	/** The selection range for an EObject's name feature, else the full range. */
	private Range nameRange(Document document, EObject obj, Range fallback) {
		EStructuralFeature feature = obj.eClass().getEStructuralFeature("name");
		if (feature != null) {
			List<INode> nodes = NodeModelUtils.findNodesForFeature(obj, feature);
			if (!nodes.isEmpty()) {
				INode n = nodes.get(0);
				return range(document, n.getOffset(), n.getEndOffset());
			}
		}
		return fallback;
	}

	private static String nameOf(EObject obj) {
		EStructuralFeature feature = obj.eClass().getEStructuralFeature("name");
		Object value = feature == null ? null : obj.eGet(feature);
		return value instanceof String ? (String) value : "";
	}

	private static Range range(Document document, int start, int end) {
		Position from = document.getPosition(start);
		Position to = document.getPosition(end);
		return new Range(from, to);
	}

	private static void sortByStart(List<DocumentSymbol> symbols) {
		symbols.sort(Comparator
				.comparingInt((DocumentSymbol s) -> s.getRange().getStart().getLine())
				.thenComparingInt(s -> s.getRange().getStart().getCharacter()));
	}

	/** Strip surrounding single quotes and collapse '' -> ', matching AlanId. */
	private static String unquote(String text) {
		if (text.length() >= 2 && text.charAt(0) == '\'' && text.charAt(text.length() - 1) == '\'') {
			return text.substring(1, text.length() - 1).replace("''", "'");
		}
		return text;
	}
}
