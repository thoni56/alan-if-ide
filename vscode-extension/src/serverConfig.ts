import { ToolResult } from './toolchain';

/**
 * The environment the language server is launched with.
 *
 * <p>Extracted so it can be asserted without an editor. #11 removed these variables
 * in favour of LSP initializationOptions and shipped diagnostics that never ran: the
 * server does not receive those options, and nothing said so. Every piece had been
 * checked in isolation and the assembled whole was broken.
 *
 * <p>It survived review because a developer has `alan` on PATH, so the client's
 * fallback and the server's fallback agree and the feature appears to work. It could
 * only fail where the compiler is somewhere else -- which is Windows, which is the
 * audience.
 */
export function serverEnvironment(base: NodeJS.ProcessEnv, compiler: ToolResult,
        keywordCase: string | undefined): NodeJS.ProcessEnv {
    const env = { ...base };
    if (compiler.ok) {
        env.ALAN_COMPILER = compiler.command;
    }
    env.ALANIF_KEYWORD_CASE = keywordCase || 'off';
    return env;
}

/**
 * What the server was told the compiler is -- the resolved command, or nothing at
 * all when none was found.
 *
 * <p>Sending {@code undefined} rather than the raw setting is deliberate: the server
 * treats a missing option as "the client had nothing to say" and falls back to its
 * own search, which is the honest answer when we genuinely could not find a compiler.
 */
export function compilerToldTo(compiler: ToolResult): string | undefined {
    return compiler.ok ? compiler.command : undefined;
}

/**
 * Whether the running server is holding a compiler path that is no longer the right
 * one.
 *
 * <p>The comparison is on the RESOLVED command rather than on the setting, because
 * the ways a path stops working mostly leave the setting untouched: the SDK is moved
 * or newly installed, or -- the case that took half an hour to recognise -- the same
 * global alanif.compiler.path is read from the other side of a remote/local switch,
 * where a Windows path is not a file at all. No configuration event fires for any of
 * those, so a trigger watching the setting cannot see them, and the server goes on
 * failing to run a path it was handed at startup while every setup surface in the
 * window reports a compiler correctly found.
 *
 * <p>Losing the compiler counts as a change too: a server left pointing at a dead
 * path would otherwise keep it, since the environment it was launched with still
 * names it.
 */
export function serverNeedsRestart(told: string | undefined, found: ToolResult): boolean {
    return compilerToldTo(found) !== told;
}
