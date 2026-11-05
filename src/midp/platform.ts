import type { JVM } from '../vm/jvm';
import { BLOCK } from '../vm/jvm';
import { byteArray, bytesOf, stringArray } from '../vm/natives/lang';
import type { JArray, JObject, JValue } from '../vm/runtime';
import { installGraphics, type FontSizes } from './graphics';
import type { Rms } from './rms';
import type { Surface, SurfaceFactory } from './surface';

export const EV = {
  KEY_PRESSED: 1,
  KEY_RELEASED: 2,
  KEY_REPEATED: 3,
  POINTER_PRESSED: 4,
  POINTER_RELEASED: 5,
  POINTER_DRAGGED: 6,
  COMMAND: 7,
  REPAINT: 8,
  SERIAL: 9,
  PAUSE: 10,
  RESUME: 11,
} as const;

/** MIDP key codes (Nokia layout for the non-numeric keys) */
export const KEY = {
  UP: -1,
  DOWN: -2,
  LEFT: -3,
  RIGHT: -4,
  FIRE: -5,
  SOFT_LEFT: -6,
  SOFT_RIGHT: -7,
  CLEAR: -8,
  STAR: 42,
  POUND: 35,
  NUM0: 48,
} as const;

const GAME_ACTIONS: Record<number, number> = {
  [-1]: 1,
  [-2]: 6,
  [-3]: 2,
  [-4]: 5,
  [-5]: 8,
  50: 1,
  56: 6,
  52: 2,
  54: 5,
  53: 8,
  49: 9,
  51: 10,
  55: 11,
  57: 12,
};

const KEY_FOR_ACTION: Record<number, number> = { 1: -1, 6: -2, 2: -3, 5: -4, 8: -5, 9: 49, 10: 51, 11: 55, 12: 57 };

export interface ScreenModel {
  kind: number;
  title: string | null;
  texts: (string | null)[];
  types: number[];
  commands: string[];
  selected: number;
}

export const BILLING = {
  /** WMA MessageConnection.send */
  SMS: 1,
  /** com.samsung.util.SMS.send */
  SAMSUNG_SMS: 2,
  /** MIDlet.platformRequest */
  PLATFORM_REQUEST: 3,
} as const;

export interface BillingRequest {
  kind: number;
  address: string;
  text: string;
  /** whether the game was told the payment went through */
  succeeded: boolean;
}

export interface MidpState {
  events: number[][];
  repaintRequested: boolean;
  painting: boolean;
  serialRequested: boolean;
  frames: number;
  screenModel: ScreenModel | null;
}

export interface MidpOptions {
  width: number;
  height: number;
  appProperties: Map<string, string>;
  surfaces: SurfaceFactory;
  rms: Rms;
  fontSizes?: FontSizes;
}

/** Host-side state of the MIDP platform: screen, event queue, lifecycle callbacks. */
export class Midp {
  readonly width: number;
  readonly height: number;
  readonly screen: Surface;
  readonly surfaces: SurfaceFactory;
  readonly rms: Rms;
  readonly appProperties: Map<string, string>;
  readonly fontSizes: FontSizes;
  frames = 0;
  onPresent: ((screen: Surface) => void) | null = null;
  onScreen: ((model: ScreenModel | null) => void) | null = null;
  getScreenTexts: (() => (string | null)[] | null) | null = null;
  onDestroyed: (() => void) | null = null;
  /** when true, SMS billing reports success to the game instead of failing like a phone without network */
  billingCrack = true;
  onBilling: ((req: BillingRequest) => void) | null = null;
  /** the high-level screen on display, null while a Canvas is shown */
  screenModel: ScreenModel | null = null;

  private events: number[][] = [];
  private repaintRequested = false;
  private painting = false;
  private serialRequested = false;
  private waiter: ((ev: number[]) => void) | null = null;

  constructor(opts: MidpOptions) {
    this.width = opts.width;
    this.height = opts.height;
    this.surfaces = opts.surfaces;
    this.rms = opts.rms;
    this.appProperties = opts.appProperties;
    this.fontSizes = opts.fontSizes ?? { small: 12, medium: 14, large: 16 };
    this.screen = opts.surfaces.create(opts.width, opts.height, true);
  }

  post(ev: number[]) {
    this.events.push(ev);
    this.wake();
  }

  keyPressed(code: number) {
    this.post([EV.KEY_PRESSED, code, 0]);
  }

  keyReleased(code: number) {
    this.post([EV.KEY_RELEASED, code, 0]);
  }

  keyRepeated(code: number) {
    this.post([EV.KEY_REPEATED, code, 0]);
  }

  pointer(type: 'pressed' | 'released' | 'dragged', x: number, y: number) {
    const t = type === 'pressed' ? EV.POINTER_PRESSED : type === 'released' ? EV.POINTER_RELEASED : EV.POINTER_DRAGGED;
    this.post([t, x | 0, y | 0]);
  }

  command(index: number, selected = -1) {
    this.post([EV.COMMAND, index, selected]);
  }

  requestRepaint() {
    this.repaintRequested = true;
    this.wake();
  }

  get repaintPending() {
    return this.repaintRequested || this.painting;
  }

  takeRepaint(): boolean {
    if (!this.repaintRequested) return false;
    this.repaintRequested = false;
    this.painting = true;
    return true;
  }

  present() {
    this.painting = false;
    this.frames++;
    this.onPresent?.(this.screen);
  }

  requestSerial() {
    this.serialRequested = true;
    this.wake();
  }

  private takeEvent(): number[] | null {
    const ev = this.events.shift();
    if (ev) return ev;
    if (this.serialRequested) {
      this.serialRequested = false;
      return [EV.SERIAL, 0, 0];
    }
    if (this.takeRepaint()) return [EV.REPAINT, 0, 0];
    return null;
  }

  private wake() {
    if (!this.waiter) return;
    const ev = this.takeEvent();
    if (!ev) return;
    const w = this.waiter;
    this.waiter = null;
    w(ev);
  }

  waitEvent(): number[] | Promise<number[]> {
    const ev = this.takeEvent();
    if (ev) return ev;
    return new Promise((resolve) => (this.waiter = resolve));
  }

  showScreen(model: ScreenModel | null) {
    this.screenModel = model;
    this.onScreen?.(model);
  }

  billing(kind: number, address: string, text: string): boolean {
    const succeeded = kind !== BILLING.PLATFORM_REQUEST && this.billingCrack;
    this.onBilling?.({ kind, address, text, succeeded });
    return succeeded;
  }

  saveState(): MidpState {
    return {
      events: this.events.map((e) => e.slice()),
      repaintRequested: this.repaintRequested,
      painting: this.painting,
      serialRequested: this.serialRequested,
      frames: this.frames,
      screenModel: this.screenModel,
    };
  }

  loadState(s: MidpState) {
    this.events = s.events.map((e) => e.slice());
    this.repaintRequested = s.repaintRequested;
    this.painting = s.painting;
    this.serialRequested = s.serialRequested;
    this.frames = s.frames;
    this.showScreen(s.screenModel);
  }
}

export function installMidp(vm: JVM, midp: Midp) {
  const intArray = (ev: number[]) => vm.wrapArray('I', Int32Array.from(ev));

  vm.registerNatives('jargame/Host', {
    'waitEvent()[I': (t) => {
      const ev = midp.waitEvent();
      if (Array.isArray(ev)) return intArray(ev);
      return vm.blockOn(t, '[', ev.then(intArray));
    },
    'requestRepaint()V': () => midp.requestRepaint(),
    'repaintPending()Z': () => midp.repaintPending,
    'takeRepaint()Z': () => midp.takeRepaint(),
    'present()V': () => midp.present(),
    'requestSerial()V': () => midp.requestSerial(),
    'screenWidth()I': () => midp.width,
    'screenHeight()I': () => midp.height,
    'notifyDestroyed()V': () => {
      midp.onDestroyed?.();
      vm.halt(0);
      return BLOCK;
    },
    'getAppProperty(Ljava/lang/String;)Ljava/lang/String;': (_t, [key]) =>
      vm.strOrNull(midp.appProperties.get(vm.js(key) ?? '') ?? null),
    'platformRequest(Ljava/lang/String;)V': (_t, [url]) => {
      midp.billing(BILLING.PLATFORM_REQUEST, vm.js(url) ?? '', '');
    },
    'billing(ILjava/lang/String;Ljava/lang/String;)Z': (_t, [kind, address, text]) =>
      midp.billing(kind as number, vm.js(address) ?? '', vm.js(text) ?? ''),
    'resource(Ljava/lang/String;)[B': (_t, [name]) => {
      const n = (vm.js(name) ?? '').replace(/^\/+/, '');
      const data = vm.app.get(n);
      return data ? byteArray(vm, data) : null;
    },
    'showCanvas()V': () => midp.showScreen(null),
    'showScreen(ILjava/lang/String;[Ljava/lang/String;[I[Ljava/lang/String;I)V': (
      _t,
      [kind, title, texts, types, commands, selected],
    ) => {
      const strs = (a: JValue) => ((a as JArray).data as (JObject | null)[]).map((o) => vm.js(o));
      midp.showScreen({
        kind: kind as number,
        title: vm.js(title),
        texts: strs(texts),
        types: Array.from((types as JArray).data as Int32Array),
        commands: strs(commands).map((s) => s ?? ''),
        selected: selected as number,
      });
    },
    'screenTexts()[Ljava/lang/String;': () => {
      const texts = midp.getScreenTexts?.();
      return texts ? stringArray(vm, texts) : null;
    },
  });

  vm.registerNatives('javax/microedition/lcdui/Canvas', {
    'getGameAction(I)I': (_t, [_self, code]) => GAME_ACTIONS[code as number] ?? 0,
    'getKeyCode(I)I': (_t, [_self, action]) => {
      const k = KEY_FOR_ACTION[action as number];
      if (k === undefined) vm.throwNew('java/lang/IllegalArgumentException');
      return k;
    },
    'getKeyName(I)Ljava/lang/String;': (_t, [_self, code]) => {
      const c = code as number;
      const names: Record<number, string> = { [-1]: 'Up', [-2]: 'Down', [-3]: 'Left', [-4]: 'Right', [-5]: 'Select', [-6]: 'Soft1', [-7]: 'Soft2' };
      return vm.str(names[c] ?? (c > 0 ? String.fromCharCode(c) : `Key${c}`));
    },
  });

  const rms = midp.rms;
  const storeName = (n: JValue) => vm.js(n) ?? '';
  const slice = (data: JValue, off: JValue, len: JValue) =>
    data == null ? new Uint8Array(0) : bytesOf(data as JArray).slice(off as number, (off as number) + (len as number));
  vm.registerNatives('javax/microedition/rms/RecordStore', {
    'listRecordStores()[Ljava/lang/String;': () => {
      const names = rms.list();
      return names.length ? stringArray(vm, names) : null;
    },
    'open0(Ljava/lang/String;Z)Z': (_t, [n, create]) => rms.open(storeName(n), !!create),
    'delete0(Ljava/lang/String;)Z': (_t, [n]) => rms.delete(storeName(n)),
    'version0(Ljava/lang/String;)I': (_t, [n]) => rms.get(storeName(n))?.version ?? 0,
    'size0(Ljava/lang/String;)I': (_t, [n]) => {
      let size = 0;
      for (const r of rms.get(storeName(n))?.records.values() ?? []) size += r.length + 8;
      return size;
    },
    'lastModified0(Ljava/lang/String;)J': (_t, [n]) => BigInt(rms.get(storeName(n))?.lastModified ?? 0),
    'nextId0(Ljava/lang/String;)I': (_t, [n]) => rms.get(storeName(n))?.nextId ?? 1,
    'ids0(Ljava/lang/String;)[I': (_t, [n]) => intArray([...(rms.get(storeName(n))?.records.keys() ?? [])]),
    'add0(Ljava/lang/String;[BII)I': (_t, [n, data, off, len]) => rms.add(storeName(n), slice(data, off, len)),
    'deleteRecord0(Ljava/lang/String;I)Z': (_t, [n, id]) => rms.remove(storeName(n), id as number),
    'get0(Ljava/lang/String;I)[B': (_t, [n, id]) => {
      const r = rms.get(storeName(n))?.records.get(id as number);
      return r ? byteArray(vm, r) : null;
    },
    'set0(Ljava/lang/String;I[BII)Z': (_t, [n, id, data, off, len]) =>
      rms.set(storeName(n), id as number, slice(data, off, len)),
  });

  installGraphics(vm, midp.surfaces, () => midp.screen, midp.fontSizes);
}
