/** Keyboard bindings for the phone keys, stored per game (falling back to the user's defaults, then built-ins). */
import type { KeyValueStore } from './midp/rms';
import { KEY } from './midp/platform';

export interface PhoneKey {
  id: string;
  label: string;
  code: number;
}

export const PHONE_KEYS: PhoneKey[] = [
  { id: 'up', label: '上', code: KEY.UP },
  { id: 'down', label: '下', code: KEY.DOWN },
  { id: 'left', label: '左', code: KEY.LEFT },
  { id: 'right', label: '右', code: KEY.RIGHT },
  { id: 'fire', label: '确定', code: KEY.FIRE },
  { id: 'soft1', label: '左软键', code: KEY.SOFT_LEFT },
  { id: 'soft2', label: '右软键', code: KEY.SOFT_RIGHT },
  { id: 'clear', label: '清除', code: KEY.CLEAR },
  { id: 'star', label: '*', code: KEY.STAR },
  { id: 'pound', label: '#', code: KEY.POUND },
  ...Array.from({ length: 10 }, (_, i) => ({ id: `num${i}`, label: String(i), code: KEY.NUM0 + i })),
];

/** phone key id -> KeyboardEvent.code values */
export type KeyMap = Record<string, string[]>;

export const DEFAULT_KEYMAP: KeyMap = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  fire: ['Enter', 'Space'],
  soft1: ['KeyQ', 'F1'],
  soft2: ['KeyE', 'F2'],
  clear: ['Backspace'],
  star: ['NumpadMultiply', 'KeyZ'],
  pound: ['NumpadDivide', 'KeyX'],
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`num${i}`, [`Digit${i}`, `Numpad${i}`]])),
};

const GLOBAL = '*';
const storageKey = (scope: string) => `jargame:keymap:${scope}`;

function copy(map: KeyMap): KeyMap {
  return Object.fromEntries(PHONE_KEYS.map((k) => [k.id, [...(map[k.id] ?? [])]]));
}

function read(kv: KeyValueStore, scope: string): KeyMap | null {
  try {
    const raw = kv.getItem(storageKey(scope));
    return raw ? copy(JSON.parse(raw) as KeyMap) : null;
  } catch {
    return null;
  }
}

export class KeyBindings {
  map: KeyMap;
  /** true when the current game has its own bindings rather than the defaults */
  custom: boolean;
  private index = new Map<string, number>();

  constructor(
    private kv: KeyValueStore,
    /** game id, or null when no game is loaded (edits then change the defaults) */
    readonly gameId: string | null,
  ) {
    const own = gameId ? read(kv, gameId) : null;
    this.custom = !!own;
    this.map = own ?? read(kv, GLOBAL) ?? copy(DEFAULT_KEYMAP);
    this.reindex();
  }

  private reindex() {
    this.index.clear();
    for (const k of PHONE_KEYS) for (const code of this.map[k.id]) this.index.set(code, k.code);
  }

  private save() {
    this.kv.setItem(storageKey(this.gameId ?? GLOBAL), JSON.stringify(this.map));
    this.custom = !!this.gameId;
    this.reindex();
  }

  /** MIDP key code bound to a KeyboardEvent.code */
  lookup(code: string): number | undefined {
    return this.index.get(code);
  }

  /** binds `code` to `keyId`, taking it away from any other phone key */
  bind(keyId: string, code: string) {
    for (const k of PHONE_KEYS) this.map[k.id] = this.map[k.id].filter((c) => c !== code);
    this.map[keyId].push(code);
    this.save();
  }

  unbind(keyId: string, code: string) {
    this.map[keyId] = this.map[keyId].filter((c) => c !== code);
    this.save();
  }

  /** drops the game's own bindings (or resets the defaults when no game is loaded) */
  reset() {
    this.kv.removeItem(storageKey(this.gameId ?? GLOBAL));
    this.map = (this.gameId ? read(this.kv, GLOBAL) : null) ?? copy(DEFAULT_KEYMAP);
    this.custom = false;
    this.reindex();
  }
}

/** short label for a KeyboardEvent.code */
export function keyLabel(code: string): string {
  const named: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Space: '空格',
    Backspace: '退格',
    NumpadMultiply: '小键盘 *',
    NumpadDivide: '小键盘 /',
    NumpadAdd: '小键盘 +',
    NumpadSubtract: '小键盘 -',
    NumpadEnter: '小键盘 Enter',
    NumpadDecimal: '小键盘 .',
  };
  if (named[code]) return named[code];
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^Numpad(\d)$/, '小键盘 $1');
}
