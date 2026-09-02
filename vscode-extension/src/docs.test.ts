import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The two READMEs must describe everything the extension actually contributes.
 *
 * <p>THE FAILURE THIS EXISTS TO CATCH, which has happened at least twice: a feature
 * ships, one README learns about it, and the other never does. Re-wrap String was
 * absent from the Marketplace listing for a week; Convert Sources to UTF-8 -- the
 * command that unbreaks a compile the author cannot otherwise diagnose -- was absent
 * from both. Nobody notices, because nothing was broken and no one rereads a README.
 *
 * <p>WHY A TEST RATHER THAN ONE SHARED FILE. The two documents are deliberately
 * different: the root README is a repo index, with build instructions, the layout and
 * LSP configuration for three other editors; vscode-extension/README.md IS the
 * Marketplace listing, where the reader is an author about to install and needs
 * screenshots and "Java is included" instead. Measured, they share the same nine
 * feature topics and not one sentence about them -- only the settings table is
 * identical. So the thing that is genuinely common is not the prose but the SET of
 * features, and package.json already holds that set. Both READMEs are prose views of
 * it, and each view is checked against the source rather than against the other.
 *
 * <p>WHAT THIS DOES NOT DO. It checks that a feature is MENTIONED, not that what is
 * said about it is true or current. It is a smoke alarm, not an editor.
 */

const extension = path.join(__dirname, '..');
const listing = path.join(extension, 'README.md');
const repo = path.join(extension, '..', 'README.md');

const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'package.json'), 'utf8'));

/**
 * Commands that belong in the manifest but not in a README, each with its reason.
 *
 * <p>Empty on purpose: every command carries the "Alan IF" category, which is to say
 * every one of them is offered to the author in the Command Palette, and a command an
 * author can run is a command an author can be told about. An entry here is a
 * decision, so it must say what the decision was -- which is the whole difference
 * between an exemption and an oversight.
 */
const undocumented = new Map<string, string>([]);

function commands(): { id: string; title: string }[] {
    return manifest.contributes.commands
        .filter((c: { command: string }) => !undocumented.has(c.command))
        .map((c: { command: string; title: string }) => ({ id: c.command, title: c.title }));
}

function settings(): string[] {
    const configuration = manifest.contributes.configuration;
    const sections = Array.isArray(configuration) ? configuration : [configuration];
    return sections.flatMap((s: { properties?: object }) => Object.keys(s.properties ?? {}));
}

/** The settings a README's own table lists, which is where an author looks them up. */
function tabulated(file: string): string[] {
    return fs.readFileSync(file, 'utf8').split('\n')
        .filter(line => line.startsWith('|'))
        .flatMap(line => line.match(/`(alanif\.[\w.]+)`/g) ?? [])
        .map(cell => cell.replace(/`/g, ''));
}

function missing(file: string, wanted: string[]): string[] {
    const text = fs.readFileSync(file, 'utf8').toLowerCase();
    return wanted.filter(w => !text.includes(w.toLowerCase()));
}

for (const [name, file] of [['the Marketplace listing', listing], ['the repo README', repo]]) {
    test(`every command is described in ${name}`, () => {
        const absent = missing(file, commands().map(c => c.title));
        assert.deepEqual(absent, [],
            `${path.relative(extension, file)} does not mention: ${absent.join(', ')}`);
    });

    test(`every setting is in the settings table of ${name}`, () => {
        const listed = tabulated(file);
        const absent = settings().filter(s => !listed.includes(s));
        // Prose elsewhere in the file does not count: a settings table that silently
        // omits one is how an author concludes the setting does not exist.
        assert.deepEqual(absent, [],
            `${path.relative(extension, file)}'s table omits: ${absent.join(', ')}`);
    });
}

test('an exemption names a command that still exists', () => {
    const contributed = new Set(
        manifest.contributes.commands.map((c: { command: string }) => c.command));
    const stale = [...undocumented.keys()].filter(id => !contributed.has(id));
    assert.deepEqual(stale, [],
        `no longer contributed, so the exemption is dead: ${stale.join(', ')}`);
});
