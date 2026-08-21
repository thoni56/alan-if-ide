import { EventEmitter, Event, ExtensionContext, workspace } from 'vscode';
import { JavaFound, JavaMissing, resolveJava } from './java';
import { ToolResult, resolveCompiler, resolveArun } from './toolchain';

/** Everything the IDE needs in order to work, and where each part came from. */
export interface Environment {
    java: JavaFound | JavaMissing;
    compiler: ToolResult;
    arun: ToolResult;
}

/**
 * The single owner of "what can this installation actually do".
 *
 * Resolution is not free -- finding the compiler probes up to seven candidates by
 * spawning each one -- so anything that wants to DISPLAY the answer (the language
 * status items, the setup check) must share one cached result rather than
 * re-resolving. The cache is invalidated by the settings that feed it, and by the
 * explicit refresh that user-initiated actions do.
 */
let extensionPath = '';
let current: Environment | undefined;

const changed = new EventEmitter<Environment>();
export const onEnvironmentChanged: Event<Environment> = changed.event;

export function initEnvironment(context: ExtensionContext): Environment {
    extensionPath = context.extensionPath;
    context.subscriptions.push(
        changed,
        workspace.onDidChangeConfiguration(e => {
            // java.home only takes effect after a reload (the server is launched with
            // it), but the reported state should still stop lying immediately.
            if (e.affectsConfiguration('alanif.java.home')) {
                refreshEnvironment();
            } else if (e.affectsConfiguration('alanif.compiler.path')
                || e.affectsConfiguration('alanif.arun.path')) {
                refreshTools();
            }
        })
    );
    return refreshEnvironment();
}

/** The cached answer, resolving once if nobody has yet. */
export function getEnvironment(): Environment {
    return current ?? refreshEnvironment();
}

/** Re-resolve everything, including Java. */
export function refreshEnvironment(): Environment {
    const cfg = workspace.getConfiguration('alanif');
    const java = resolveJava(extensionPath, cfg.get<string>('java.home'));
    current = { java, ...resolveToolchain() };
    changed.fire(current);
    return current;
}

/**
 * Re-resolve just the Alan tools, keeping the known Java.
 *
 * Play calls this: the toolchain can appear or move between one Play and the next
 * (the author installs an SDK while the window is open), but a JVM probe costs a
 * process start for an answer that cannot change without a reload anyway.
 */
export function refreshTools(): Environment {
    const java = current?.java ?? resolveJava(extensionPath,
        workspace.getConfiguration('alanif').get<string>('java.home'));
    current = { java, ...resolveToolchain() };
    changed.fire(current);
    return current;
}

function resolveToolchain(): { compiler: ToolResult; arun: ToolResult } {
    const cfg = workspace.getConfiguration('alanif');
    const compiler = resolveCompiler(cfg.get<string>('compiler.path'));
    const arun = resolveArun(
        compiler.ok ? compiler.command : undefined,
        cfg.get<string>('arun.path'));
    return { compiler, arun };
}

/** True when editing, diagnostics and Play are all available. */
export function isComplete(env: Environment): boolean {
    return env.java.ok && env.compiler.ok && env.arun.ok;
}
