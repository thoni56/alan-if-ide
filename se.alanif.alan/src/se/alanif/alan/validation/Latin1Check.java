package se.alanif.alan.validation;

import java.util.ArrayList;
import java.util.List;

/**
 * Finds characters the Alan compiler cannot represent.
 *
 * <p>Alan works internally in ISO-8859-1. Given {@code -encoding utf8} the compiler
 * transcodes the source, and a character above U+00FF has no target representation,
 * so iconv returns EILSEQ and the compiler aborts with
 * {@code SYSTEM ERROR: error converting from UTF-8 ... converter.c:133} -- reported
 * at line 0 of the MAIN even when the character is in an imported file, and with the
 * compile abandoned, so every other diagnostic in the project disappears with it.
 *
 * <p>The audience makes this likely rather than exotic: macOS substitutes a curly
 * apostrophe for {@code '} and an ellipsis for {@code ...} by default, and text
 * pasted from a word processor carries curly quotes and dashes. An author writing
 * prose produces these without ever choosing to.
 *
 * <p>Scanning is deliberately blind to syntax. The failure happens in the compiler's
 * file reader, below the lexer, so a character inside a comment breaks the build
 * exactly as one inside a string does.
 */
final class Latin1Check {

    /** One character that will not survive transcoding. */
    static final class Finding {
        final int offset;      // UTF-16 offset into the text
        final int length;      // 1, or 2 for a surrogate pair
        final int codePoint;

        Finding(int offset, int length, int codePoint) {
            this.offset = offset;
            this.length = length;
            this.codePoint = codePoint;
        }
    }

    /** Beyond this many in one file the Problems panel is noise, not information. */
    static final int LIMIT = 100;

    private Latin1Check() {
    }

    static List<Finding> scan(String text) {
        List<Finding> findings = new ArrayList<>();
        for (int i = 0; i < text.length(); ) {
            int cp = text.codePointAt(i);
            int n = Character.charCount(cp);
            if (cp > 0xFF) {
                findings.add(new Finding(i, n, cp));
                if (findings.size() >= LIMIT) {
                    break;
                }
            }
            i += n;
        }
        return findings;
    }

    /**
     * What to tell the author. Naming the character is not enough for someone who
     * did not knowingly type it, so where there is an obvious plain-text equivalent
     * we say what to replace it with.
     */
    static String message(int codePoint) {
        if (codePoint == 0xFFFD) {
            // The one case where the useful advice is counter-intuitive, so it leads.
            // Nothing is lost yet: the bytes on disk are still whatever they were --
            // it is an EDIT followed by a save that writes the placeholder back over
            // them. A clean buffer is not rewritten by an ordinary save.
            return "This file was read with the wrong encoding: U+FFFD is a placeholder, "
                    + "not the character the file really contains. Run \"Alan IF: Convert "
                    + "Sources to UTF-8\" to repair the project -- reopening the file with "
                    + "another encoding only fixes the view until the tab is closed. Editing "
                    + "and saving this file first would write the placeholder to disk and "
                    + "lose the original for good.";
        }
        String replacement = plainEquivalent(codePoint);
        if (replacement != null) {
            // Lead with the fix. The Problems panel truncates, so the first words have
            // to be the ones worth reading, and here that is what to type instead.
            return String.format("Replace %s (U+%04X) with %s: the Alan compiler cannot "
                    + "represent it.", quoted(codePoint), codePoint, replacement);
        }
        return String.format("%s (U+%04X) cannot be represented in ISO-8859-1, which the "
                + "Alan compiler requires.", quoted(codePoint), codePoint);
    }

    /** The character itself, so the author can see what to look for. */
    private static String quoted(int codePoint) {
        return "'" + new String(Character.toChars(codePoint)) + "'";
    }

    /** Plain-text stand-ins for what an editor or word processor substitutes silently. */
    private static String plainEquivalent(int codePoint) {
        switch (codePoint) {
            case 0x2018: case 0x2019: case 0x201B: return "a straight quote (')";
            case 0x201C: case 0x201D: case 0x201F: return "a straight double quote (\")";
            case 0x2013: return "a hyphen (-)";
            case 0x2014: return "two hyphens (--)";
            case 0x2026: return "three dots (...)";
            case 0x2212: return "a hyphen (-)";
            case 0x2032: return "a straight quote (')";
            case 0x2033: return "a straight double quote (\")";
            case 0x00A0: return null;   // in Latin-1; never reported
            case 0x2010: case 0x2011: return "a hyphen (-)";
            case 0x00AB: case 0x00BB: return null;
            default: return null;
        }
    }
}
