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
