import * as path from 'path';

/** What Play in External Interpreter needs from the editor and the system. */
export interface ExternalPlay {
    /** Compile `main` in `dir`, resolving to whether it compiled. */
    compile(dir: string, main: string): Promise<boolean>;
    /** Hand `file` to whatever program the system opens it with. */
    open(file: string): Promise<boolean>;
    notCompiled(main: string): void;
}

/**
 * Compile the main file and, if that worked, let the system open the game.
 *
 * <p>The system, not the IDE, picks the interpreter, so this works for WinArun and
 * Gargoyle alike, neither of which can be the interpreter Play runs in a terminal.
 * The game runs outside the editor, so a new run cannot end the previous one.
 */
export async function playExternally(main: string, io: ExternalPlay): Promise<void> {
    const dir = path.dirname(main);
    const mainName = path.basename(main);
    if (!await io.compile(dir, mainName)) {
        io.notCompiled(mainName);
        return;
    }
    await io.open(gameOf(main));
}

/** The compiled game, which the compiler writes beside the main file. */
export function gameOf(main: string): string {
    return path.join(path.dirname(main), path.basename(main, path.extname(main)) + '.a3c');
}
