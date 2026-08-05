package se.alanif.alan.conversion;

import org.eclipse.xtext.common.services.DefaultTerminalConverters;
import org.eclipse.xtext.conversion.IValueConverter;
import org.eclipse.xtext.conversion.ValueConverter;
import org.eclipse.xtext.conversion.ValueConverterException;
import org.eclipse.xtext.nodemodel.INode;

/**
 * Value converter for the {@code AlanId} datatype rule. When the id was written
 * in quoted form ({@code 'restore'}, {@code 'foo''s'}) the model value is the bare
 * name ({@code restore}, {@code foo's}); plain and keyword-form ids pass through.
 * (Alan quotes a word to use it as an identifier; {@code ''} is an escaped quote.)
 *
 * The converter is on AlanId, not QUOTED_ID: AlanId is a datatype rule, so its
 * value is its own node text and a converter on the inner terminal never fires.
 */
public class AlanValueConverterService extends DefaultTerminalConverters {

    @ValueConverter(rule = "AlanId")
    public IValueConverter<String> AlanId() {
        return new IValueConverter<String>() {
            @Override
            public String toValue(String string, INode node) throws ValueConverterException {
                if (string == null || string.length() < 2
                        || string.charAt(0) != '\'') {
                    return string; // plain or keyword-form id
                }
                String inner = string.substring(1, string.length() - 1);
                return inner.replace("''", "'");
            }

            @Override
            public String toString(String value) throws ValueConverterException {
                // Re-quote only if needed (contains whitespace or a quote).
                if (value.isEmpty() || value.chars().anyMatch(c -> Character.isWhitespace(c) || c == '\'')) {
                    return "'" + value.replace("'", "''") + "'";
                }
                return value;
            }
        };
    }
}
