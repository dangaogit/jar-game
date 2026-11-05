import { unzipSync } from 'fflate';
import { Midp } from './midp/platform';
import { installMidp } from './midp/platform';
import { Rms, type KeyValueStore } from './midp/rms';
import type { SurfaceFactory } from './midp/surface';
import type { FontSizes } from './midp/graphics';
import { JVM } from './vm/jvm';
import { installLang } from './vm/natives/lang';
import type { JObject, JThread } from './vm/runtime';

export interface MidletEntry {
  name: string;
  icon: string | null;
  className: string;
}

export interface GameInfo {
  name: string;
  vendor: string;
  version: string;
  midlets: MidletEntry[];
  properties: Map<string, string>;
}

export function readJar(bytes: Uint8Array): Map<string, Uint8Array> {
  return new Map(Object.entries(unzipSync(bytes)));
}

export function parseManifest(text: string): Map<string, string> {
  const props = new Map<string, string>();
  let lastKey: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith(' ') && lastKey) {
      props.set(lastKey, props.get(lastKey)! + raw.slice(1));
      continue;
    }
    const i = raw.indexOf(':');
    if (i <= 0) continue;
    lastKey = raw.slice(0, i).trim();
    props.set(lastKey, raw.slice(i + 1).trim());
  }
  return props;
}

function decodeManifest(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('gbk').decode(bytes);
  }
}

export function gameInfo(entries: Map<string, Uint8Array>): GameInfo {
  const mf = entries.get('META-INF/MANIFEST.MF');
  const props = mf ? parseManifest(decodeManifest(mf)) : new Map<string, string>();
  const midlets: MidletEntry[] = [];
  for (let i = 1; props.has(`MIDlet-${i}`); i++) {
    const [name, icon, className] = props.get(`MIDlet-${i}`)!.split(',').map((s) => s.trim());
    if (className) midlets.push({ name, icon: icon || null, className });
  }
  if (midlets.length === 0) {
    // jars without a usable manifest: guess the MIDlet among top-level classes
    for (const key of entries.keys()) {
      if (key.endsWith('.class') && !key.includes('/')) {
        midlets.push({ name: key, icon: null, className: key.slice(0, -6) });
      }
    }
  }
  return {
    name: props.get('MIDlet-Name') ?? midlets[0]?.name ?? 'unknown',
    vendor: props.get('MIDlet-Vendor') ?? '',
    version: props.get('MIDlet-Version') ?? '',
    midlets,
    properties: props,
  };
}

export interface EmulatorOptions {
  rt: Map<string, Uint8Array>;
  game: Map<string, Uint8Array>;
  surfaces: SurfaceFactory;
  storage: KeyValueStore | null;
  width?: number;
  height?: number;
  fontSizes?: FontSizes;
  out?: (text: string, stream: 1 | 2) => void;
}

export class Emulator {
  readonly vm: JVM;
  readonly midp: Midp;
  readonly info: GameInfo;
  readonly rms: Rms;

  constructor(opts: EmulatorOptions) {
    this.info = gameInfo(opts.game);
    this.rms = new Rms(opts.storage, `${this.info.name}|${this.info.vendor}`);
    this.vm = new JVM({ boot: opts.rt, app: opts.game, out: opts.out });
    this.midp = new Midp({
      width: opts.width ?? 240,
      height: opts.height ?? 320,
      appProperties: this.info.properties,
      surfaces: opts.surfaces,
      rms: this.rms,
      fontSizes: opts.fontSizes,
    });
    this.vm.install(installLang, (vm) => installMidp(vm, this.midp));
  }

  start(midletIndex = 0): JThread {
    const m = this.info.midlets[midletIndex];
    if (!m) throw new Error('no MIDlet found in jar');
    return this.vm.runMain('jargame/Boot', [m.className]);
  }

  stop() {
    this.vm.halt(0);
  }

  onUncaught(fn: (threadName: string, description: string) => void) {
    this.vm.onUncaught = (t: JThread, ex: JObject) => fn(t.name, this.vm.describeThrowable(ex));
  }
}
