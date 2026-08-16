package se.alanif.alan.formatting;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.eclipse.emf.ecore.EObject;
import org.eclipse.xtext.AbstractRule;
import org.eclipse.xtext.GrammarUtil;
import org.eclipse.xtext.Keyword;
import org.eclipse.xtext.RuleCall;
import org.eclipse.xtext.nodemodel.ICompositeNode;
import org.eclipse.xtext.nodemodel.ILeafNode;
import org.eclipse.xtext.nodemodel.INode;
import org.eclipse.xtext.parser.IParseResult;

/**
 * Structure-aware whole-document indenter for Alan.
 *
 * <p>Indentation is derived from the parse NODE MODEL, not from keyword guessing
 * (the reason the old token indenter failed on prose-heavy code): even though
 * statement/verb/property bodies are datatype rules with no EObjects, the node
 * model is still a fully nested composite tree with source offsets.
 *
 * <p>The rule: {@code indent(line) = } the number of "body-wrapper" nodes (see
 * {@link #WRAPPERS}) that span the line, with two refinements that make it match
 * the canonical Alan layout:
 * <ol>
 * <li>A wrapper does NOT indent a first line it shares with a preceding keyword --
 *     an inline value ({@code Description "..."}, {@code ELSE "..."}) rather than a
 *     fresh block body. This is the string-vs-statement distinction a token scanner
 *     cannot make.</li>
 * <li>A block's own {@code end} closer (a direct-child keyword) aligns with its
 *     header, so {@code End exit} / {@code End depend} dedent; a nested block's
 *     closer sits inside a child node and is unaffected.</li>
 * </ol>
 *
 * <p>Multi-line STRING interiors are frozen verbatim -- the author's layout inside
 * a string is deliberate and never reflowed. Only leading whitespace is rewritten;
 * line breaks and inner spacing are preserved.
 */
public class AlanStructuralFormatter {

	/** How grammar keywords are cased. Alan folds case, so this is purely cosmetic. */
	public enum KeywordCase {
		OFF, LOWER, UPPER, CAPITALIZE;

		/** Parse a setting value ("lower"/"upper"/"capitalize"), defaulting to OFF. */
		public static KeywordCase from(String value) {
			if (value == null) {
				return OFF;
			}
			switch (value.trim().toLowerCase(Locale.ROOT)) {
				case "lower":      return LOWER;
				case "upper":      return UPPER;
				case "capitalize": return CAPITALIZE;
				default:           return OFF;
			}
		}
	}

	/** One wrapper per real indent level; pass-through chain nodes are excluded. */
	private static final Set<String> WRAPPERS = new HashSet<>(Arrays.asList(
		"Properties", "Statements", "ContainerBody", "StepList",
		"VerbBody", "DependCases", "OptionalExitBody", "AttributeDefinition",
		"SynonymList", "SyntaxList", "MessageList", "OptionList"));

	private String text;
	private String[] lines;
	private int[] lineStart;

	/**
	 * @param parse   the parse result whose node model drives indentation
	 * @param source  the document text the node model was parsed from
	 * @param unit    one indent level (e.g. {@code "\t"} or N spaces)
	 * @return the re-indented document
	 */
	public String format(IParseResult parse, String source, String unit, int tabSize, KeywordCase keywordCase) {
		this.text = source;
		buildLineIndex();
		int n = lines.length;
		int[] stringOwner = new int[n + 2];   // interior string line -> its opener line, else 0
		int[] indent = new int[n + 2];
		if (parse != null && parse.getRootNode() != null) {
			markStringInteriors(parse.getRootNode(), stringOwner);
			accumulate(parse.getRootNode(), indent);
			if (keywordCase != KeywordCase.OFF) {
				applyKeywordCasing(parse.getRootNode(), keywordCase);
			}
		}
		StringBuilder out = new StringBuilder(source.length() + 64);
		for (int i = 0; i < n; i++) {
			int line = i + 1;
			if (stringOwner[line] != 0) {
				out.append(shiftInterior(lines[i], stringOwner[line], indent, unit, tabSize));
			} else if (lines[i].trim().isEmpty()) {
				// blank line -> emit empty (never indentation-only whitespace)
			} else {
				out.append(repeat(unit, Math.max(0, indent[line]))).append(ltrim(lines[i]));
			}
			if (i < n - 1) {
				out.append('\n');
			}
		}
		return out.toString();
	}

	/**
	 * Re-indent one interior line of a multi-line string so the whole string moves
	 * as a rigid block: the interior keeps its VISUAL column offset relative to the
	 * opener's original indent, applied to the opener's new indent. Column-based so
	 * it is robust to mixed tabs/spaces; whitespace inside a string is output-neutral,
	 * so this never changes game text.
	 */
	private String shiftInterior(String lineText, int owner, int[] indent, String unit, int tabSize) {
		String lw = leadingWhitespace(lineText);
		String content = lineText.substring(lw.length());
		if (content.isEmpty()) {
			return "";                                   // blank interior line
		}
		int origOpenerCol = visualCol(leadingWhitespace(lines[owner - 1]), tabSize);
		int newOpenerCol = visualCol(repeat(unit, Math.max(0, indent[owner])), tabSize);
		int newCol = Math.max(0, newOpenerCol + (visualCol(lw, tabSize) - origOpenerCol));
		return repeat(" ", newCol) + content;
	}

	/** Visual column width of a whitespace run (tabs advance to the next tab stop). */
	private static int visualCol(String ws, int tabSize) {
		int c = 0;
		for (int i = 0; i < ws.length(); i++) {
			c += ws.charAt(i) == '\t' ? tabSize - (c % tabSize) : 1;
		}
		return c;
	}

	/** +1 to every line a wrapper spans, minus a shared first line and its own closer. */
	private void accumulate(INode node, int[] indent) {
		if (!(node instanceof ICompositeNode)) {
			return;
		}
		String rule = ruleName(node);
		if (rule != null && WRAPPERS.contains(rule)) {
			ILeafNode first = firstLeaf(node), last = lastLeaf(node);
			if (first != null && last != null) {
				int fLine = lineOf(first.getOffset());
				int lLine = lineOf(last.getOffset());
				boolean leading = isLineLeading(first.getOffset());
				int cap = directChildEndLine(node);   // this block's own 'end' closer line
				for (int L = fLine; L <= lLine; L++) {
					if (L == fLine && !leading) {
						continue;                      // inline value shares the header line
					}
					if (cap != -1 && L >= cap) {
						continue;                      // 'end ...' aligns with the header
					}
					indent[L] += 1;
				}
			}
		}
		for (INode c : ((ICompositeNode) node).getChildren()) {
			accumulate(c, indent);
		}
	}

	/**
	 * Rewrite every grammar KEYWORD to the chosen case, in place (casing preserves
	 * length, so line offsets are unchanged and indentation/strings are untouched).
	 * Only leaves whose grammar element is a real {@link Keyword} are touched --
	 * never plain identifiers, never string content, and (crucially) never a SOFT
	 * keyword used as an identifier: Alan's {@code AlanId} rule accepts words like
	 * {@code location}, {@code actor}, {@code of}, {@code taking} as names, so a
	 * built-in class reference ({@code Isa location}) or an attribute named {@code of}
	 * is left alone, while the same word as a genuine keyword ({@code Current location},
	 * {@code wheels of car}) is cased.
	 */
	private void applyKeywordCasing(ICompositeNode root, KeywordCase kc) {
		char[][] buf = new char[lines.length][];
		for (int i = 0; i < lines.length; i++) {
			buf[i] = lines[i].toCharArray();
		}
		for (ILeafNode leaf : root.getLeafNodes()) {
			if (leaf.isHidden() || !(leaf.getGrammarElement() instanceof Keyword)) {
				continue;
			}
			AbstractRule rule = GrammarUtil.containingRule(leaf.getGrammarElement());
			if (rule != null && "AlanId".equals(rule.getName())) {
				continue;   // soft keyword serving as an identifier -> leave it
			}
			String cased = applyCase(leaf.getText(), kc);
			if (cased.equals(leaf.getText())) {
				continue;
			}
			int line = lineOf(leaf.getOffset());
			int col = leaf.getOffset() - lineStart[line - 1];
			char[] row = buf[line - 1];
			for (int k = 0; k < cased.length() && col + k < row.length; k++) {
				row[col + k] = cased.charAt(k);
			}
		}
		for (int i = 0; i < lines.length; i++) {
			lines[i] = new String(buf[i]);
		}
	}

	private static String applyCase(String s, KeywordCase kc) {
		switch (kc) {
			case LOWER:
				return s.toLowerCase(Locale.ROOT);
			case UPPER:
				return s.toUpperCase(Locale.ROOT);
			case CAPITALIZE:
				return s.isEmpty() ? s
					: Character.toUpperCase(s.charAt(0)) + s.substring(1).toLowerCase(Locale.ROOT);
			default:
				return s;
		}
	}

	/** Record each multi-line string's interior lines against its opener line, so
	 *  they can be shifted with the opener instead of frozen at an absolute column. */
	private void markStringInteriors(INode node, int[] stringOwner) {
		for (INode n : ((ICompositeNode) node).getChildren()) {
			if (n instanceof ILeafNode) {
				String t = n.getText();
				if (t.indexOf('"') >= 0 && t.indexOf('\n') >= 0) {
					int s = lineOf(n.getOffset());
					int e = lineOf(n.getOffset() + n.getLength() - 1);
					for (int L = s + 1; L <= e; L++) {         // interior only; opener line re-indents
						stringOwner[L] = s;
					}
				}
			} else if (n instanceof ICompositeNode) {
				markStringInteriors(n, stringOwner);
			}
		}
	}

	/** The leading run of spaces/tabs of a line. */
	private static String leadingWhitespace(String s) {
		int i = 0;
		while (i < s.length() && (s.charAt(i) == ' ' || s.charAt(i) == '\t')) {
			i++;
		}
		return s.substring(0, i);
	}

	/** Line of a direct-child {@code end} keyword (a block's own closer), or -1. */
	private int directChildEndLine(INode node) {
		for (INode c : ((ICompositeNode) node).getChildren()) {
			if (c instanceof ILeafNode && !((ILeafNode) c).isHidden()
					&& c.getText().equalsIgnoreCase("end")) {
				return lineOf(c.getOffset());
			}
		}
		return -1;
	}

	// ---- text/line helpers ----

	private void buildLineIndex() {
		List<Integer> starts = new ArrayList<>();
		starts.add(0);
		for (int i = 0; i < text.length(); i++) {
			if (text.charAt(i) == '\n') {
				starts.add(i + 1);
			}
		}
		lineStart = new int[starts.size()];
		for (int i = 0; i < starts.size(); i++) {
			lineStart[i] = starts.get(i);
		}
		lines = text.split("\n", -1);
	}

	/** 1-based line containing a character offset. */
	private int lineOf(int offset) {
		int lo = 0, hi = lineStart.length - 1, ans = 0;
		while (lo <= hi) {
			int m = (lo + hi) >>> 1;
			if (lineStart[m] <= offset) {
				ans = m;
				lo = m + 1;
			} else {
				hi = m - 1;
			}
		}
		return ans + 1;
	}

	/** True if only whitespace precedes {@code offset} on its line. */
	private boolean isLineLeading(int offset) {
		int ls = lineStart[lineOf(offset) - 1];
		for (int i = ls; i < offset && i < text.length(); i++) {
			char c = text.charAt(i);
			if (c != ' ' && c != '\t') {
				return false;
			}
		}
		return true;
	}

	private ILeafNode firstLeaf(INode n) {
		for (ILeafNode l : ((ICompositeNode) n).getLeafNodes()) {
			if (!l.isHidden() && !l.getText().trim().isEmpty()) {
				return l;
			}
		}
		return null;
	}

	private ILeafNode lastLeaf(INode n) {
		ILeafNode r = null;
		for (ILeafNode l : ((ICompositeNode) n).getLeafNodes()) {
			if (!l.isHidden() && !l.getText().trim().isEmpty()) {
				r = l;
			}
		}
		return r;
	}

	private static String ruleName(INode n) {
		EObject ge = n.getGrammarElement();
		if (ge instanceof RuleCall) {
			return ((RuleCall) ge).getRule().getName();
		}
		if (ge instanceof AbstractRule) {
			return ((AbstractRule) ge).getName();
		}
		return null;
	}

	private static String repeat(String s, int count) {
		if (count <= 0) {
			return "";
		}
		StringBuilder sb = new StringBuilder(s.length() * count);
		for (int i = 0; i < count; i++) {
			sb.append(s);
		}
		return sb.toString();
	}

	private static String ltrim(String s) {
		int i = 0;
		while (i < s.length() && (s.charAt(i) == ' ' || s.charAt(i) == '\t')) {
			i++;
		}
		return s.substring(i);
	}
}
