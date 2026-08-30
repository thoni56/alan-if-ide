package se.alanif.alan.ide.formatting;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static se.alanif.alan.ide.formatting.FormatterFixture.format;
import static se.alanif.alan.ide.formatting.FormatterFixture.formatWithTabs;
import static se.alanif.alan.ide.formatting.FormatterFixture.lines;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * What Format Document does to Alan source.
 *
 * <p>The formatter has never had tests. Its rules were checked once by hand and once by
 * a scratch harness that no longer exists, on the day they were written -- and it is the
 * only part of the system that rewrites an author's file in place, for authors who could
 * not tell a formatting bug from having broken their own game.
 *
 * <p>Written from the rules the formatter documents and from real Alan sources, NOT from
 * the old token indenter, which could not distinguish an inline string from a statement
 * body and whose behaviour is therefore a specification of nothing.
 */
class FormatterTest {

	@Nested
	@DisplayName("indentation follows the block structure")
	class Structure {

		@Test
		@DisplayName("a body is one level in from its header, however the author left it")
		void bodiesNestFromTheirHeaders() {
			String[] out = lines(format(
					"Every thing IsA object",
					"Verb poke",
					"Does",
					"\"You poke it.\"",
					"End verb.",
					"End every."));

			assertArrayEquals(new String[] {
					"Every thing IsA object",
					"    Verb poke",
					"        Does",
					"            \"You poke it.\"",
					"    End verb.",
					"End every.",
			}, out);
		}

		@Test
		@DisplayName("over-indented source is brought back, not merely left alone")
		void reindentsRatherThanPreserves() {
			String[] out = lines(format(
					"                Every thing IsA object",
					"        Verb poke",
					"                        Does",
					"      \"You poke it.\"",
					"                End verb.",
					"  End every."));

			assertEquals("Every thing IsA object", out[0]);
			assertEquals("    Verb poke", out[1]);
			assertEquals("        Does", out[2]);
			assertEquals("    End verb.", out[4]);
			assertEquals("End every.", out[5]);
		}

		@Test
		@DisplayName("a block's own End aligns with the header it closes")
		void endAlignsWithItsHeader() {
			// The refinement that fixes End exit / End depend: the closer is a direct
			// child of the block, so it must not be swept along with the body.
			String[] out = lines(format(
					"The peak IsA location",
					"Exit east to grotto does",
					"\"The light from the entrance.\"",
					"End exit.",
					"End the."));

			assertEquals("    Exit east to grotto does", out[1]);
			assertEquals("    End exit.", out[3], "End exit did not come back to its header");
			assertEquals("End the.", out[4]);
		}

		@Test
		@DisplayName("two statements of the same body get the same indent")
		void siblingStatementsAgree() {
			// The real damage the old counting did, found across the corpus. When the
			// first statement rides on the header line, the body opened on the SECOND
			// statement's line -- so two statements of one block came out a level apart,
			// which reads as nesting that is not there.
			String[] out = lines(format(
					"Every thing IsA object",
					"Verb examine",
					"Does Only \"You see nothing special.\"",
					"If this is not plural then",
					"\"window.\"",
					"End if.",
					"End verb.",
					"End every."));

			assertEquals("        Does Only \"You see nothing special.\"", out[2]);
			assertEquals("        If this is not plural then", out[3],
					"a sibling statement was indented deeper than the one before it");
			assertEquals("        End if.", out[5]);
		}

		@Test
		@DisplayName("one written line is one level, even when the grammar nests twice")
		void aBodyIntroducedOnTheHeaderLineGainsOneLevel() {
			// FOUND BY THIS TEST, and it predates it. Compare three shapes:
			//
			//   Exit ... does / body          body lands 2 levels in from Exit
			//   Exit ... / Check / body       Check +1, body +1  -- one level per line
			//   Verb poke / Does / body       Does  +1, body +1  -- one level per line
			//
			// The odd one has its introducing keyword ('does') on the HEADER line, so
			// there is no written line to carry the second level -- but OptionalExitBody
			// and Statements both span the body, and both count. Refinement 1 suppresses
			// a wrapper only for a first line it SHARES with a keyword, not for the rest
			// of its range.
			//
			// Thomas chose one level, like the others: the level count follows the lines
			// the author can see, not the grammar nodes that happen to nest. The corpus
			// is written that way too (h_dragon_peak.i has Exit at one tab and its prose
			// at two), though that only tells us what its author typed.
			String[] out = lines(format(
					"The peak IsA location",
					"Exit east to grotto does",
					"\"The light from the entrance.\"",
					"End exit.",
					"End the."));

			assertEquals("        \"The light from the entrance.\"", out[2]);
		}

		@Test
		@DisplayName("a blank line is emitted blank, never as stranded whitespace")
		void blankLinesCarryNoIndent() {
			String[] out = lines(format(
					"Every thing IsA object",
					"    ",
					"End every."));

			assertEquals("", out[1]);
		}
	}

	@Nested
	@DisplayName("strings")
	class Strings {

		@Test
		@DisplayName("a short one stays on the line with its keyword")
		void inlineValuesStayInline() {
			// The distinction a word scanner could not make, and the reason the old
			// indenter was abandoned: this is a value, not the start of a block.
			String[] out = lines(format(
					"The hall IsA location",
					"Description \"A dusty hall.\"",
					"End the."));

			assertEquals("    Description \"A dusty hall.\"", out[1]);
		}

		@Test
		@DisplayName("the inside of a multi-line one is never touched")
		void stringInteriorsAreNeverReflowed() {
			String formatted = format(
					"The hall IsA location",
					"Description",
					"\"First line of prose.",
					"   Second line, oddly indented on purpose.",
					"Third line.\"",
					"End the.");

			// Whatever happens to the leading whitespace, the words and the line breaks
			// between them are the author's and must survive exactly.
			assertEquals("First line of prose.\nSecond line, oddly indented on purpose.\nThird line.",
					String.join("\n", java.util.Arrays.stream(lines(formatted))
							.filter(l -> l.contains("line") || l.contains("Second"))
							.map(String::trim)
							.map(l -> l.replace("\"", ""))
							.toList()));
		}
	}

	@Nested
	@DisplayName("whatever the author's settings")
	class Options {

		@Test
		@DisplayName("tabs are used when tabs are asked for")
		void honoursTabs() {
			String[] out = lines(formatWithTabs(
					"Every thing IsA object",
					"Verb poke",
					"Does",
					"\"You poke it.\"",
					"End verb.",
					"End every."));

			assertEquals("\tVerb poke", out[1]);
			assertEquals("\t\tDoes", out[2]);
		}
	}

	@Nested
	@DisplayName("formatting twice changes nothing the second time")
	class Idempotence {

		@Test
		@DisplayName("on a document with every construct that has a rule of its own")
		void isStable() {
			String[] source = {
					"The peak IsA location",
					"Name Dragon Peak",
					"Description \"A short one.\"",
					"Exit east to grotto does",
					"\"You walk for what seems like an hour",
					"before the cave ends in a grotto.\"",
					"End exit.",
					"End the.",
					"",
					"Every thing IsA object",
					"Verb poke",
					"Does",
					"\"You poke it.\"",
					"End verb.",
					"End every.",
			};

			String once = format(source);
			String twice = format(lines(once));

			// The property the whole design rests on: an author who formats, edits and
			// formats again must never see the file drift.
			assertEquals(once, twice, "formatting was not stable on the second pass");
		}
	}
}
