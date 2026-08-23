import {
    CancellationToken, CodeAction, CodeActionContext, CodeActionKind, CodeActionProvider,
    Diagnostic, ExtensionContext, Range, TextDocument, WorkspaceEdit, languages
} from 'vscode';

/**
 * Offer the fix where the problem is visible.
 *
 * A notification vanishes after a few seconds and a beginner has no idea how to
 * "run a command"; a lightbulb on the squiggle is right there, and stays for as long
 * as the problem does.
 *
 * The two diagnostics need OPPOSITE fixes, which is why this reads the character
 * rather than trusting the message:
 *   - a curly quote in a UTF-8 file needs the CHARACTER replaced -- converting the
 *     project would not help at all, the file is already UTF-8;
 *   - U+FFFD means the FILE was decoded wrongly, and no edit here can recover the
 *     original character; the project has to be converted.
 */
const CODE = 'alanif.encoding.unrepresentable';

class EncodingFixes implements CodeActionProvider {
    provideCodeActions(
        document: TextDocument, range: Range, context: CodeActionContext, _token: CancellationToken
    ): CodeAction[] {
        const actions: CodeAction[] = [];
        for (const diagnostic of context.diagnostics.filter(isOurs)) {
            const character = document.getText(diagnostic.range);
            if (character === '�') {
                actions.push(convertProject(diagnostic));
                continue;
            }
            const plain = plainEquivalent(character);
            if (plain !== undefined) {
                actions.push(replaceWith(document, diagnostic, character, plain));
            }
        }
        return actions;
    }
}

function isOurs(d: Diagnostic): boolean {
    const code = typeof d.code === 'object' ? d.code.value : d.code;
    return String(code) === CODE;
}

function replaceWith(
    document: TextDocument, diagnostic: Diagnostic, character: string, plain: string
): CodeAction {
    const action = new CodeAction(
        `Replace ${character} with ${plain === "'" ? "'" : plain}`, CodeActionKind.QuickFix);
    action.edit = new WorkspaceEdit();
    action.edit.replace(document.uri, diagnostic.range, plain);
    action.diagnostics = [diagnostic];
    action.isPreferred = true;
    return action;
}

function convertProject(diagnostic: Diagnostic): CodeAction {
    const action = new CodeAction(
        'Convert this project’s sources to UTF-8', CodeActionKind.QuickFix);
    action.command = { command: 'alanif.convertSources', title: 'Convert Sources to UTF-8' };
    action.diagnostics = [diagnostic];
    action.isPreferred = true;
    return action;
}

/**
 * Plain-text stand-ins, mirroring Latin1Check.plainEquivalent on the server.
 * KEEP THE TWO IN STEP: the server writes the suggestion into the message, this
 * performs it, and a disagreement would offer a fix that contradicts its own text.
 */
function plainEquivalent(character: string): string | undefined {
    switch (character.codePointAt(0)) {
        case 0x2018: case 0x2019: case 0x201B: case 0x2032: return "'";
        case 0x201C: case 0x201D: case 0x201F: case 0x2033: return '"';
        case 0x2013: case 0x2010: case 0x2011: case 0x2212: return '-';
        case 0x2014: return '--';
        case 0x2026: return '...';
        default: return undefined;
    }
}

export function registerEncodingFixes(context: ExtensionContext): void {
    context.subscriptions.push(languages.registerCodeActionsProvider(
        { language: 'alanif' }, new EncodingFixes(),
        { providedCodeActionKinds: [CodeActionKind.QuickFix] }));
}
