package se.alanif.alan.ide.formatting;

import java.util.Collections;
import java.util.List;

import org.eclipse.lsp4j.DocumentFormattingParams;
import org.eclipse.lsp4j.DocumentRangeFormattingParams;
import org.eclipse.lsp4j.FormattingOptions;
import org.eclipse.lsp4j.TextEdit;
import org.eclipse.xtext.ide.server.Document;
import org.eclipse.xtext.ide.server.formatting.FormattingService;
import org.eclipse.xtext.parser.IParseResult;
import org.eclipse.xtext.resource.XtextResource;
import org.eclipse.xtext.util.CancelIndicator;

import se.alanif.alan.formatting.AlanStructuralFormatter;

/**
 * Whole-document "Format Document" for Alan.
 *
 * <p>Bypasses Xtext's model-based formatter (AbstractFormatter2), which cannot
 * reach Alan's shallow-model statement bodies, and runs the node-model
 * {@link AlanStructuralFormatter} instead, returning a single replace TextEdit.
 * The client's tab settings (insert-spaces / tab-size) choose the indent unit.
 *
 * <p>Formatting is skipped when the document has syntax errors: the node model is
 * then partial, so re-indenting could misplace lines. Range formatting is a no-op
 * (the indenter is whole-document context-dependent).
 */
public class AlanFormattingService extends FormattingService {

	@Override
	public List<? extends TextEdit> format(Document document, XtextResource resource,
			DocumentFormattingParams params, CancelIndicator cancelIndicator) {
		IParseResult parse = resource.getParseResult();
		if (parse == null || parse.getRootNode() == null
				|| parse.getSyntaxErrors().iterator().hasNext()) {
			return Collections.emptyList();
		}
		String original = document.getContents();
		FormattingOptions options = params.getOptions();
		int tabSize = options != null && options.getTabSize() > 0 ? options.getTabSize() : 4;
		// Keyword-case style reaches the server via env (same channel as ALAN_COMPILER);
		// migrates to proper LSP config with the client-agnostic-config work (#11).
		AlanStructuralFormatter.KeywordCase keywordCase =
				AlanStructuralFormatter.KeywordCase.from(se.alanif.alan.AlanConfiguration.keywordCase());
		String formatted = new AlanStructuralFormatter()
				.format(parse, original, indentUnit(options), tabSize, keywordCase);
		if (formatted.equals(original)) {
			return Collections.emptyList();
		}
		return Collections.singletonList(toTextEdit(document, formatted, 0, original.length()));
	}

	@Override
	public List<? extends TextEdit> format(Document document, XtextResource resource,
			DocumentRangeFormattingParams params, CancelIndicator cancelIndicator) {
		return Collections.emptyList();
	}

	/** One indent level from the client's tab settings; tabs unless it asks for spaces. */
	private static String indentUnit(FormattingOptions options) {
		if (options != null && options.isInsertSpaces()) {
			int width = Math.max(1, options.getTabSize());
			StringBuilder sb = new StringBuilder(width);
			for (int i = 0; i < width; i++) {
				sb.append(' ');
			}
			return sb.toString();
		}
		return "\t";
	}
}
