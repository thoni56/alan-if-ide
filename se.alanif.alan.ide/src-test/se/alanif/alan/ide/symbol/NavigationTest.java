package se.alanif.alan.ide.symbol;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * What names mean, and — mostly — what they do not.
 *
 * <p>Alan folds several kinds of name into one flat namespace as far as text is
 * concerned, so nearly every rule here is about a token NOT resolving to the
 * plausible-looking thing that shares its spelling. Those are the assertions that rot:
 * a change that improves one feature quietly widens or narrows another, and nothing
 * fails until someone rests a cursor somewhere and notices nothing happened.
 */
class NavigationTest {

	@Nested
	@DisplayName("a loop variable is bound by its loop")
	class LexicalLocals {

		private NavigationFixture program() throws Exception {
			return NavigationFixture.of(
					"The gadget IsA object",                 // 1  a global of the same name
					"End the gadget.",                       // 2
					"",
					"The kitchen IsA location",              // 4
					"End the kitchen.",                      // 5
					"",
					"Every thing IsA object",                // 7
					"  Verb poke",                           // 8
					"    Does",                              // 9
					"      For each <1>gadget do",           // 10 the binder
					"        Locate <2>gadget in kitchen.",  // 11
					"        For each gadget do",            // 12 an inner rebind
					"          Locate <3>gadget in kitchen.",// 13
					"        End each.",                     // 14
					"        Describe <4>gadget.",           // 15
					"      End each.",                       // 16
					"      Describe <5>gadget.",             // 17 outside: the global
					"      Describe <6>this.",               // 18
					"  End verb.",
					"End every.",
					"",
					"Start at kitchen.");
		}

		@Test
		@DisplayName("shadows a global instance spelled the same")
		void shadowsGlobal() throws Exception {
			assertEquals(List.of(10), program().definitionsAt(2));
		}

		@Test
		@DisplayName("an inner loop rebinding the name starts a new variable")
		void innerRebindShadows() throws Exception {
			assertEquals(List.of(12), program().definitionsAt(3));
		}

		@Test
		@DisplayName("outside the loop the same word is the global again")
		void outsideTheLoopItIsGlobal() throws Exception {
			assertEquals(List.of(1), program().definitionsAt(5));
		}

		@Test
		@DisplayName("'this' is the enclosing entity")
		void thisIsTheEnclosingEntity() throws Exception {
			assertEquals(List.of(7), program().definitionsAt(6));
		}

		@Test
		@DisplayName("references stop at the inner scope, and do not leak into it")
		void referencesRespectShadowing() throws Exception {
			assertEquals(List.of(10, 11, 15), program().referencesAt(2));
			assertEquals(List.of(12, 13), program().referencesAt(3));
		}

		@Test
		@DisplayName("asking about the global does not drag in the loop variables")
		void globalReferencesExcludeLocals() throws Exception {
			assertEquals(List.of(1, 2, 17), program().referencesAt(5));
		}

		@Test
		@DisplayName("highlighting agrees with both of them")
		void highlightAgrees() throws Exception {
			assertEquals(List.of(10, 11, 15), program().highlightsAt(2));
		}
	}

	@Nested
	@DisplayName("a verb parameter is bound by its syntax")
	class VerbParameters {

		private NavigationFixture program() throws Exception {
			return NavigationFixture.of(
					"The obj IsA object",                    // 1  a global spelled 'obj'
					"End the obj.",                          // 2
					"",
					"Syntax poke = poke (<1>obj)!",          // 4  the declaration
					"   Where <2>obj Isa object",            // 5  a restriction clause
					"      Else \"No.\"",                    // 6
					"",
					"The kitchen IsA location",              // 8
					"End the kitchen.",                      // 9
					"",
					"Every thing IsA object",                // 11
					"  Verb poke",                           // 12
					"    Does",
					"      Locate <3>obj in kitchen.",       // 14 the parameter
					"  End verb.",
					"  Verb prod",                           // 16 declares no parameters
					"    Does",
					"      Locate <4>obj in kitchen.",       // 18 so this is the global
					"  End verb.",
					"End every.",
					"",
					"The rock IsA thing",                    // 22
					"  Verb poke",                           // 23 an override
					"    Does",
					"      Locate <5>obj in kitchen.",       // 25 the same parameter
					"  End verb.",
					"End the rock.",
					"",
					"Start at kitchen.");
		}

		@Test
		@DisplayName("resolves to the syntax, not to an instance of the same name")
		void resolvesToTheSyntax() throws Exception {
			assertEquals(List.of(4), program().definitionsAt(3));
		}

		@Test
		@DisplayName("a verb whose syntax declares no such parameter falls through to the global")
		void unrelatedVerbFallsThrough() throws Exception {
			assertEquals(List.of(1), program().definitionsAt(4));
		}

		@Test
		@DisplayName("a Where clause refers to the parameter too")
		void whereClauseIsTheParameter() throws Exception {
			assertEquals(List.of(4), program().definitionsAt(2));
		}

		@Test
		@DisplayName("references span every body of that verb, including overrides")
		void referencesSpanOverrides() throws Exception {
			assertEquals(List.of(4, 5, 14, 25), program().referencesAt(3));
		}

		@Test
		@DisplayName("asking about the global does not drag in the parameters")
		void globalReferencesExcludeParameters() throws Exception {
			assertEquals(List.of(1, 2, 18), program().referencesAt(4));
		}

		@Test
		@DisplayName("highlighting stays inside the document but knows it is a parameter")
		void highlightKnowsParameters() throws Exception {
			assertEquals(List.of(4, 5, 14, 25), program().highlightsAt(3));
		}
	}

	@Nested
	@DisplayName("a verb is a chain of declarations, not a set of them")
	class VerbChain {

		private NavigationFixture program() throws Exception {
			return NavigationFixture.of(
					"Syntax poke = poke (obj)!",             // 1  the syntax
					"   Where obj Isa object",
					"      Else \"No.\"",
					"",
					"Verb poke",                             // 5  the global default
					"  Does \"Generic.\"",
					"End verb.",
					"",
					"The kitchen IsA location",
					"End the kitchen.",
					"",
					"Every thing IsA object",                // 12
					"  Verb <1>poke",                        // 13 the base class
					"    Does \"Thing.\"",
					"  End verb.",
					"End every.",
					"",
					"Every gadget IsA thing",                // 18
					"  Verb <2>poke",                        // 19 a subclass
					"    Does \"Gadget.\"",
					"  End verb.",
					"End every.",
					"",
					"The rock IsA gadget",                   // 24
					"  Verb <3>poke",                        // 25 an instance
					"    Does \"Rock.\"",
					"  End verb.",
					"End the rock.",
					"",
					"Start at kitchen.");
		}

		@Test
		@DisplayName("from an instance: syntax, global, then every level above it, in order")
		void wholeChainFromTheInstance() throws Exception {
			assertEquals(List.of(1, 5, 13, 19, 25), program().definitionsAt(3));
		}

		@Test
		@DisplayName("from a class the chain stops there: downward is not knowable")
		void upwardOnly() throws Exception {
			assertEquals(List.of(1, 5, 13, 19), program().definitionsAt(2));
			assertEquals(List.of(1, 5, 13), program().definitionsAt(1));
		}
	}

	@Nested
	@DisplayName("names that mean nothing to jump to")
	class NoTarget {

		@Test
		@DisplayName("'current actor' is runtime context, not a declaration")
		void currentActorResolvesNowhere() throws Exception {
			NavigationFixture program = NavigationFixture.of(
					"The actor IsA object",                  // 1  a global spelled 'actor'
					"End the actor.",
					"",
					"The kitchen IsA location",
					"End the kitchen.",
					"",
					"Every thing IsA object",
					"  Verb poke",
					"    Does",
					"      Locate this in current <1>actor.",
					"  End verb.",
					"End every.",
					"",
					"Start at kitchen.");
			assertEquals(List.of(), program.definitionsAt(1));
		}
	}
}
