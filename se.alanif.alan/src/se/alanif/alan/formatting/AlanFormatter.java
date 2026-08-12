package se.alanif.alan.formatting;

import java.util.NoSuchElementException;
import java.util.Scanner;

/**
 * Whole-document indenter for Alan, ported from the old AlanIDE's
 * AlanFormattingStrategy -- a stateful, token/keyword-driven, line-by-line pass.
 *
 * <p>Why token-based and not Xtext's AbstractFormatter2: the Alan grammar keeps
 * statement/verb/check/does bodies as datatype rules (no EObjects), so a
 * model-based formatter can't reach inside them. This token pass can, and it lets
 * the old AlanIDE's 25 formatting cases port over directly.
 *
 * <p>String interiors are never re-flowed (the author's layout is deliberate); the
 * only thing done inside a multi-line string is the one-space continuation the
 * original applied.
 */
public class AlanFormatter {

    private static final int INDENT = 2;

    private static final String[] INDENTING_KEYWORDS = {
        "THEN", "ELSE", "VERB", "START", "ADD", "THE", "EVERY", "OPTIONS", "CHECK", "DOES",
        "OPTION", "SYNONYMS", "SYNTAX", "MESSAGE", "WHERE", "DO", "DEPENDING", "CONTAINER",
        "IS", "ARE", "HAS", "CAN"};
    private static final String[] OUTDENTING_KEYWORDS = {"ELSE", "ELSIF", "DOES", "END"};
    private static final String[] TOPLEVEL_OPEN_CLAUSE_INITIALISER_KEYWORDS = {
        "OPTIONS", "OPTION", "SYNONYMS", "MESSAGE", "SYNTAX", "START", "THE", "EVERY", "WHEN", "VERB", "EVENT"};
    private static final String[] TOPLEVEL_FOLLOWER_KEYWORDS = {
        "OPTIONS", "OPTION", "SYNONYMS", "MESSAGE", "SYNTAX", "START", "ADD", "THE", "EVERY", "VERB"};
    private static final String[] PROPERTIES_OPENING_KEYWORDS = {
        "NAME", "DESCRIPTION", "ENTERED", "INITIALIZE", "MENTIONED", "DEFINITE", "INDEFINITE",
        "NEGATIVE", "ARTICLE", "FORM", "SCRIPT", "PRONOUN", "WITH", "OPAQUE", "CONTAINER",
        "IS", "ARE", "HAS", "CAN"};
    private static final String[] PROPERTIES_FOLLOWER_KEYWORDS = {
        "NAME", "DESCRIPTION", "ENTERED", "INITIALIZE", "MENTIONED", "DEFINITE", "INDEFINITE",
        "NEGATIVE", "ARTICLE", "FORM", "SCRIPT", "PRONOUN", "WITH", "OPAQUE", "CONTAINER",
        "IS", "ARE", "HAS", "CAN", "END"};
    private static final String[] EXTRA_OUTDENT_ON_END_INITIALISER_KEYWORDS = {"DEPENDING", "DOES"};

    private boolean withinString;
    private boolean openTopLevelClause;
    private boolean outdentExtraOnEnd;
    private boolean openPropertiesClause;

    /** Re-indent a whole document. Line endings are preserved. */
    public String format(String content) {
        withinString = false;
        openTopLevelClause = false;
        outdentExtraOnEnd = false;
        openPropertiesClause = false;

        String eol = content.contains("\r\n") ? "\r\n" : "\n";
        String[] rawLines = content.split("\n", -1);
        StringBuilder out = new StringBuilder();
        int currentIndent = 0;
        for (int i = 0; i < rawLines.length; i++) {
            String line = rawLines[i];
            if (line.endsWith("\r")) {
                line = line.substring(0, line.length() - 1);
            }
            currentIndent = calculatePreIndentation(line, currentIndent);
            String trimmed = ltrim(line);
            // A blank line stays blank -- never emit indentation-only (trailing) whitespace.
            out.append(trimmed.isEmpty() ? "" : repeat(" ", currentIndent) + trimmed);
            currentIndent = calculatePostIndentation(line, currentIndent);
            if (currentIndent < 0) {
                currentIndent = 0;
            }
            if (i < rawLines.length - 1) {
                out.append(eol);
            }
        }
        return out.toString();
    }

    private int calculatePreIndentation(String line, int currentIndent) {
        int indent = currentIndent;
        Scanner scanner = new Scanner(line);
        while (scanner.hasNext()) {
            String token = scanner.next();
            if (isComment(token)) {
                return indent;
            }
            if (isOutdentingKeyword(token)) {
                indent -= INDENT;
            }
            if (openTopLevelClause && isTopLevelFollower(token)) {
                indent -= INDENT;
                openTopLevelClause = false;
            }
            if (openPropertiesClause && isPropertiesFollower(token)) {
                indent -= INDENT;
                openPropertiesClause = false;
            }
            if (token.equalsIgnoreCase("END") && outdentExtraOnEnd) {
                indent -= INDENT;
                outdentExtraOnEnd = false;
            }
        }
        return indent;
    }

    private int calculatePostIndentation(String line, int currentIndent) {
        Scanner scanner = new Scanner(line);
        while (scanner.hasNext()) {
            String token = scanner.next();
            if (isComment(token)) {
                return currentIndent;
            } else if (hasOddNumberOfQuotes(token)) {
                currentIndent = toggleStringIndentation(currentIndent);
            } else if (isIndentingKeyword(token)) {
                currentIndent += INDENT;
            }
            if (isTopLevelOpenClauseInitialiser(token)) {
                openTopLevelClause = true;
            }
            if (isPropertiesOpenClauseInitialiser(token)) {
                openPropertiesClause = true;
            }
            if (isKeywordOpeningClauseRequiringExtraOutdentOnEnd(token)) {
                outdentExtraOnEnd = true;
            }
            skipExtraKeywords(scanner, token);
        }
        return currentIndent;
    }

    private boolean isComment(String token) {
        return token.equals("--");
    }

    /** After 'end' skip the entity kind; after 'add' skip 'to' and the name. */
    private void skipExtraKeywords(Scanner scanner, String token) {
        if (token.equalsIgnoreCase("END") && scanner.hasNext()) {
            scanner.next();
        }
        if (token.equalsIgnoreCase("ADD")) {
            try {
                scanner.next();
                scanner.next();
            } catch (NoSuchElementException e) {
                // fewer tokens than expected -- ignore
            }
        }
    }

    private int toggleStringIndentation(int currentIndent) {
        currentIndent += withinString ? -1 : 1;
        withinString = !withinString;
        return currentIndent;
    }

    private boolean hasOddNumberOfQuotes(String token) {
        int count = 0;
        for (int i = 0; i < token.length(); i++) {
            if (token.charAt(i) == '"') {
                count++;
            }
        }
        return count % 2 == 1;
    }

    private boolean isIndentingKeyword(String token) {
        return memberOf(token, INDENTING_KEYWORDS);
    }

    private boolean isOutdentingKeyword(String token) {
        return memberOf(token, OUTDENTING_KEYWORDS);
    }

    private boolean isKeywordOpeningClauseRequiringExtraOutdentOnEnd(String token) {
        return memberOf(token, EXTRA_OUTDENT_ON_END_INITIALISER_KEYWORDS);
    }

    private boolean isTopLevelOpenClauseInitialiser(String token) {
        return memberOf(token, TOPLEVEL_OPEN_CLAUSE_INITIALISER_KEYWORDS);
    }

    private boolean isTopLevelFollower(String token) {
        return memberOf(token, TOPLEVEL_FOLLOWER_KEYWORDS);
    }

    private boolean isPropertiesOpenClauseInitialiser(String token) {
        return memberOf(token, PROPERTIES_OPENING_KEYWORDS);
    }

    private boolean isPropertiesFollower(String token) {
        return memberOf(token, PROPERTIES_FOLLOWER_KEYWORDS);
    }

    private boolean memberOf(String token, String[] keywords) {
        for (String keyword : keywords) {
            if (token.equalsIgnoreCase(keyword)) {
                return true;
            }
        }
        return false;
    }

    private String repeat(String s, int count) {
        if (count <= 0) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < count; i++) {
            sb.append(s);
        }
        return sb.toString();
    }

    private String ltrim(String source) {
        return source.replaceAll("^\\s+", "");
    }
}
