package se.alanif.alan.resource;

import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EStructuralFeature;
import org.eclipse.xtext.nodemodel.ICompositeNode;
import org.eclipse.xtext.nodemodel.util.NodeModelUtils;
import org.eclipse.xtext.resource.DefaultLocationInFileProvider;
import org.eclipse.xtext.util.ITextRegion;
import org.eclipse.xtext.util.TextRegion;

/**
 * Makes a declaration's "significant" region span its whole HEADER LINE rather
 * than a per-node-type sub-span. This is the region Xtext hands to LSP for
 * go-to-definition and find-references entries, so it controls what shows in the
 * References / Peek list. The default picks a different span per rule (the name
 * for one, the tail for another), which reads asymmetrically -- "To Every
 * encyclopedia", "britannica Isa encyclopedia". With this, every named
 * declaration reports its full first line, so the list reads like a mini-outline:
 * "Every encyclopedia Isa book" / "Add To Every encyclopedia" /
 * "The britannica Isa encyclopedia".
 */
public class AlanLocationInFileProvider extends DefaultLocationInFileProvider {

	@Override
	public ITextRegion getSignificantTextRegion(EObject obj) {
		EStructuralFeature name = obj.eClass().getEStructuralFeature("name");
		if (name != null && name.getEType().getInstanceClass() == String.class && obj.eIsSet(name)) {
			ICompositeNode node = NodeModelUtils.getNode(obj);
			if (node != null) {
				String text = node.getRootNode().getText();
				int start = node.getOffset(); // skips leading indentation/comments
				int newline = text.indexOf('\n', start);
				int end = newline < 0 ? text.length() : newline;
				while (end > start && Character.isWhitespace(text.charAt(end - 1))) {
					end--;
				}
				if (end > start) {
					return new TextRegion(start, end - start);
				}
			}
		}
		return super.getSignificantTextRegion(obj);
	}
}
