import type { Emulator } from '../emulator';

/** what the side panels need from the main page */
export interface App {
  readonly emu: Emulator | null;
  log(text: string, err?: boolean): void;
  /** replaces the running emulator with one resumed from a save state; throws if the state does not apply */
  restore(data: Uint8Array): void;
  /** reboots the current game from its jar */
  restart(): void;
  /** small JPEG data URL of the current screen */
  thumbnail(): string;
}

export interface Panel {
  /** called whenever a game is loaded, restarted or restored */
  attach(emu: Emulator): void;
}
