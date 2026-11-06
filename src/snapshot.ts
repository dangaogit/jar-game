/**
 * Save states: serializes the whole VM (classes, heap, threads, monitors, native peers such as image pixels),
 * the MIDP host state and RMS into one compressed blob, and restores it into a fresh, not yet started Emulator.
 */
import { unzlibSync, zlibSync } from 'fflate';
import type { Emulator } from './emulator';
import type { MidpState } from './midp/platform';
import type { Surface } from './midp/surface';
import { CpTag } from './vm/classfile';
import { clinitDone, type JVM } from './vm/jvm';
import { Frame, JArray, JObject, JThread, Monitor, NO_OVERRIDE, RtClass, TState } from './vm/runtime';

const MAGIC = 0x4a475331; // "JGS1"
const VERSION = 1;

/** The VM is waiting on an asynchronous native (e.g. an image still decoding); retry shortly. */
export class SnapshotBusyError extends Error {}

/** tagged JSON value; tags are the first element of an array */
type Enc = null | number | string | Enc[] | { [k: string]: Enc };

interface Header {
  version: number;
  game: string;
  time: number;
  /** `clock`: game's currentTimeMillis() when saved (absent in older saves) */
  vm: { icount: number; hashSeed: number; nextThreadId: number; console: [number[], number[]]; clock?: number };
  /** [name, state, statics, initThread, classObj] */
  classes: [string, number, Enc[], Enc, Enc][];
  interned: [string, Enc][];
  threads: Enc[];
  midp: Enc;
  rms: string;
  /** number of objects pre-registered by both sides (the screen surface) */
  known: number;
  objs: Enc[];
}

export interface StateInfo {
  game: string;
  time: number;
}

const TYPED: [string, new (buf: ArrayBuffer) => ArrayBufferView][] = [
  ['b', Int8Array],
  ['c', Uint16Array],
  ['s', Int16Array],
  ['i', Int32Array],
  ['f', Float32Array],
  ['d', Float64Array],
  ['j', BigInt64Array],
];

function typedCode(v: ArrayBufferView): string {
  for (const [code, ctor] of TYPED) if (v instanceof (ctor as any)) return code;
  throw new Error(`cannot save ${v.constructor.name}`);
}

function typedCtor(code: string) {
  const e = TYPED.find(([c]) => c === code);
  if (!e) throw new Error(`bad typed array code ${code}`);
  return e[1];
}

const isSurface = (o: any): o is Surface => 'clipKey' in o && 'mutable' in o && 'w' in o;

/** `Class.nameDesc` of the method invoked by the top frame, for a thread blocked inside a native */
function blockedNative(t: JThread): string | null {
  const f = t.top;
  const cf = f?.m.cls.cf;
  if (!f || !f.m.code || !cf) return null;
  const code = f.m.code;
  const op = code[f.invPc];
  if (op < 182 || op > 185) return null;
  const ref = cf.cp[(code[f.invPc + 1] << 8) | code[f.invPc + 2]];
  if (!ref || (ref.tag !== CpTag.Methodref && ref.tag !== CpTag.InterfaceMethodref)) return null;
  const cls = cf.cp[ref.classIndex];
  const nat = cf.cp[ref.natIndex];
  if (cls?.tag !== CpTag.Class || nat?.tag !== CpTag.NameAndType) return null;
  const utf = (i: number) => {
    const e = cf.cp[i];
    return e?.tag === CpTag.Utf8 ? e.value : '';
  };
  return `${utf(cls.nameIndex)}.${utf(nat.nameIndex)}${utf(nat.descIndex)}`;
}

const WAIT_EVENT = 'jargame/Host.waitEvent()[I';

// ---------------------------------------------------------------------------
// encoding
// ---------------------------------------------------------------------------

class Encoder {
  private ids = new Map<object, number>();
  private order: object[] = [];
  readonly blobs: Uint8Array[] = [];

  constructor(private now: number) {}

  ref(o: object): Enc {
    let id = this.ids.get(o);
    if (id === undefined) {
      id = this.order.length;
      this.ids.set(o, id);
      this.order.push(o);
    }
    return ['r', id];
  }

  value(v: unknown): Enc {
    switch (typeof v) {
      case 'number':
        return Number.isFinite(v) && !Object.is(v, -0) ? v : ['n', Object.is(v, -0) ? '-0' : String(v)];
      case 'string':
        return v;
      case 'bigint':
        return ['l', v.toString()];
      case 'boolean':
        return ['b', v ? 1 : 0];
      case 'undefined':
        return ['u'];
      case 'object':
        return v === null ? null : this.ref(v);
      default:
        throw new Error(`cannot save a ${typeof v}`);
    }
  }

  values(a: ArrayLike<unknown>, n = a.length): Enc[] {
    const out: Enc[] = new Array(n);
    for (let i = 0; i < n; i++) out[i] = this.value(a[i]);
    return out;
  }

  private blob(b: Uint8Array): number {
    this.blobs.push(b);
    return this.blobs.length - 1;
  }

  private typed(v: ArrayBufferView): [string, number] {
    return [typedCode(v), this.blob(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))];
  }

  /** encodes the bodies of all referenced objects (including ones discovered while encoding) */
  bodies(): Enc[] {
    const out: Enc[] = [];
    for (let i = 0; i < this.order.length; i++) out.push(this.body(this.order[i]));
    return out;
  }

  private body(o: any): Enc {
    if (o instanceof JArray) {
      const mon = this.value(o.mon);
      if (ArrayBuffer.isView(o.data)) return ['A', o.cls.name, o.hash, mon, ...this.typed(o.data)];
      return ['A', o.cls.name, o.hash, mon, null, this.values(o.data)];
    }
    if (o instanceof JObject) return ['O', o.cls.name, o.hash, this.value(o.mon), this.value(o.peer), this.values(o.f)];
    if (o instanceof Monitor) return ['M', this.value(o.owner), o.count, this.values(o.waiters)];
    if (o instanceof JThread) {
      const timed = o.state === TState.Sleeping || o.state === TState.Waiting;
      return [
        'T',
        o.id,
        o.name,
        o.state,
        this.value(timed ? o.wakeAt - this.now : 0),
        this.value(o.blockMon),
        this.value(o.blockInit),
        o.waitCount,
        o.notified ? 1 : 0,
        o.interrupted ? 1 : 0,
        this.value(o.resume),
        this.value(o.resumeThrow),
        this.value(o.javaThread),
        this.values(o.frames),
      ];
    }
    if (o instanceof Frame) {
      const hasOverride = o.retOverride !== NO_OVERRIDE;
      return [
        'F',
        o.m.cls.name,
        o.m.key,
        o.pc,
        o.invPc,
        o.sp,
        this.value(o.syncObj),
        hasOverride ? 1 : 0,
        hasOverride ? this.value(o.retOverride) : null,
        o.onReturn ? 1 : 0,
        this.values(o.locals),
        this.values(o.stack, o.sp),
      ];
    }
    if (o instanceof RtClass) return ['C', o.name, o.isPrimitive ? 1 : 0];
    if (ArrayBuffer.isView(o)) return ['t', ...this.typed(o)];
    if (Array.isArray(o)) return ['a', this.values(o)];
    if (isSurface(o)) {
      let blob = -1;
      if (o.ctx && o.w > 0 && o.h > 0) {
        const px = o.ctx.getImageData(0, 0, o.w, o.h).data;
        blob = this.blob(new Uint8Array(px.buffer, px.byteOffset, px.byteLength));
      }
      return ['S', o.w, o.h, o.mutable ? 1 : 0, blob];
    }
    const proto = Object.getPrototypeOf(o);
    if (proto === Object.prototype || proto === null) {
      const fields: { [k: string]: Enc } = {};
      for (const k of Object.keys(o)) fields[k] = this.value(o[k]);
      return ['P', fields];
    }
    throw new Error(`cannot save object of type ${proto?.constructor?.name ?? '?'}`);
  }
}

export function saveState(emu: Emulator): Uint8Array {
  const vm = emu.vm;
  if (vm.halted) throw new Error('游戏已停止，无法存档');
  for (const t of vm.threads) {
    if (t.state === TState.BlockedNative && blockedNative(t) !== WAIT_EVENT) {
      throw new SnapshotBusyError(`thread ${t.name} is blocked in ${blockedNative(t) ?? 'a native method'}`);
    }
  }
  const e = new Encoder(vm.now());
  e.ref(emu.midp.screen);
  const classes: Header['classes'] = [];
  for (const cls of vm.classes.values()) {
    classes.push([cls.name, cls.state, e.values(cls.statics), e.value(cls.initThread), e.value(cls.classObj)]);
  }
  const header: Header = {
    version: VERSION,
    game: emu.id,
    time: Date.now(),
    vm: {
      icount: vm.icount,
      hashSeed: vm.hashSeed,
      nextThreadId: vm.nextThreadId,
      console: [vm.consoleBuf[1].slice(), vm.consoleBuf[2].slice()],
      clock: vm.currentTimeMillis(),
    },
    classes,
    interned: [...vm.interned].map(([s, o]) => [s, e.value(o)]),
    threads: e.values(vm.threads),
    midp: e.value(emu.midp.saveState()),
    rms: emu.rms.exportJson(),
    known: 1,
    objs: [],
  };
  header.objs = e.bodies();
  return pack(header, e.blobs);
}

function pack(header: Header, blobs: Uint8Array[]): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(header));
  let size = 8 + json.length;
  for (const b of blobs) size += 4 + b.length;
  const raw = new Uint8Array(size);
  const dv = new DataView(raw.buffer);
  dv.setUint32(0, json.length);
  raw.set(json, 4);
  let p = 4 + json.length;
  dv.setUint32(p, blobs.length);
  p += 4;
  for (const b of blobs) {
    dv.setUint32(p, b.length);
    raw.set(b, p + 4);
    p += 4 + b.length;
  }
  const body = zlibSync(raw, { level: 4 });
  const out = new Uint8Array(8 + body.length);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, MAGIC);
  odv.setUint32(4, VERSION);
  out.set(body, 8);
  return out;
}

function unpack(data: Uint8Array): { header: Header; blobs: Uint8Array[] } {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < 8 || dv.getUint32(0) !== MAGIC) throw new Error('不是 JarGame 存档文件');
  if (dv.getUint32(4) !== VERSION) throw new Error(`不支持的存档版本 ${dv.getUint32(4)}`);
  const raw = unzlibSync(data.subarray(8));
  const rdv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const jsonLen = rdv.getUint32(0);
  const header = JSON.parse(new TextDecoder().decode(raw.subarray(4, 4 + jsonLen))) as Header;
  let p = 4 + jsonLen;
  const n = rdv.getUint32(p);
  p += 4;
  const blobs: Uint8Array[] = [];
  for (let i = 0; i < n; i++) {
    const len = rdv.getUint32(p);
    blobs.push(raw.subarray(p + 4, p + 4 + len));
    p += 4 + len;
  }
  return { header, blobs };
}

export function readStateInfo(data: Uint8Array): StateInfo {
  const { header } = unpack(data);
  return { game: header.game, time: header.time };
}

// ---------------------------------------------------------------------------
// decoding
// ---------------------------------------------------------------------------

class Decoder {
  readonly objs: unknown[] = [];
  private now: number;

  constructor(
    private emu: Emulator,
    private bodies: Enc[],
    private blobs: Uint8Array[],
    known: object[],
  ) {
    this.now = emu.vm.now();
    for (let i = 0; i < bodies.length; i++) this.objs.push(i < known.length ? known[i] : this.alloc(bodies[i] as Enc[]));
    for (let i = 0; i < known.length; i++) this.fillKnown(known[i], bodies[i] as Enc[]);
    for (let i = known.length; i < bodies.length; i++) this.fill(this.objs[i], bodies[i] as Enc[]);
  }

  private get vm(): JVM {
    return this.emu.vm;
  }

  cls(name: string): RtClass {
    const c = this.vm.classes.get(name);
    if (c) return c;
    if (name[0] === '[') return this.vm.arrayClass(name.slice(1));
    return this.vm.loadClass(name);
  }

  value(e: Enc): any {
    if (e === null || typeof e === 'number' || typeof e === 'string') return e;
    if (!Array.isArray(e)) throw new Error('bad encoded value');
    switch (e[0]) {
      case 'r':
        return this.objs[e[1] as number];
      case 'n':
        return e[1] === '-0' ? -0 : Number(e[1]);
      case 'l':
        return BigInt(e[1] as string);
      case 'b':
        return e[1] === 1;
      case 'u':
        return undefined;
      default:
        throw new Error(`bad value tag ${e[0]}`);
    }
  }

  values(a: Enc): any[] {
    return (a as Enc[]).map((v) => this.value(v));
  }

  private typed(code: Enc, blob: Enc): any {
    const Ctor = typedCtor(code as string);
    return new Ctor(this.blobs[blob as number].slice().buffer);
  }

  private pixels(s: Surface, blob: number) {
    if (blob < 0 || !s.ctx) return;
    const px = new Uint8ClampedArray(this.blobs[blob].slice().buffer);
    s.ctx.putImageData(new ImageData(px, s.w, s.h), 0, 0);
    s.clipKey = '';
    s.fill = '';
    s.font = '';
  }

  private alloc(b: Enc[]): unknown {
    switch (b[0]) {
      case 'O':
        return new JObject(this.cls(b[1] as string), []);
      case 'A': {
        const cls = this.cls(b[1] as string);
        const data = b[4] !== null ? this.typed(b[4], b[5]) : new Array((b[5] as Enc[]).length).fill(null);
        return new JArray(cls, data);
      }
      case 'M':
        return new Monitor();
      case 'T':
        return new JThread(b[1] as number, b[2] as string);
      case 'F': {
        const m = this.cls(b[1] as string).methods.get(b[2] as string);
        if (!m) throw new Error(`存档中的方法不存在: ${b[1]}.${b[2]}`);
        return new Frame(m);
      }
      case 'C':
        return b[2] === 1 ? this.vm.classForDesc(b[1] as string) : this.cls(b[1] as string);
      case 't':
        return this.typed(b[1], b[2]);
      case 'a':
        return [];
      case 'P':
        return {};
      case 'S': {
        const s = this.emu.midp.surfaces.create(b[1] as number, b[2] as number, b[3] === 1);
        this.pixels(s, b[4] as number);
        return s;
      }
      default:
        throw new Error(`bad object tag ${b[0]}`);
    }
  }

  private fillKnown(o: object, b: Enc[]) {
    if (b[0] !== 'S' || !isSurface(o)) throw new Error('存档与当前模拟器不匹配');
    this.pixels(o, b[4] as number);
  }

  private fill(o: any, b: Enc[]) {
    switch (b[0]) {
      case 'O': {
        const obj = o as JObject;
        obj.hash = b[2] as number;
        obj.mon = this.value(b[3]);
        obj.peer = this.value(b[4]);
        obj.f = this.values(b[5]);
        break;
      }
      case 'A': {
        const arr = o as JArray;
        arr.hash = b[2] as number;
        arr.mon = this.value(b[3]);
        if (b[4] === null) {
          const d = arr.data as unknown[];
          (b[5] as Enc[]).forEach((v, i) => (d[i] = this.value(v)));
        }
        break;
      }
      case 'M': {
        const m = o as Monitor;
        m.owner = this.value(b[1]);
        m.count = b[2] as number;
        m.waiters = this.values(b[3]);
        break;
      }
      case 'T': {
        const t = o as JThread;
        t.state = b[3] as number;
        const wakeRel = this.value(b[4]) as number;
        t.wakeAt = t.state === TState.Sleeping || t.state === TState.Waiting ? this.now + wakeRel : 0;
        t.blockMon = this.value(b[5]);
        t.blockInit = this.value(b[6]);
        t.waitCount = b[7] as number;
        t.notified = b[8] === 1;
        t.interrupted = b[9] === 1;
        t.resume = this.value(b[10]);
        t.resumeThrow = this.value(b[11]);
        t.javaThread = this.value(b[12]);
        t.frames = this.values(b[13]);
        break;
      }
      case 'F': {
        const f = o as Frame;
        f.pc = b[3] as number;
        f.invPc = b[4] as number;
        f.sp = b[5] as number;
        f.syncObj = this.value(b[6]);
        f.retOverride = b[7] === 1 ? this.value(b[8]) : NO_OVERRIDE;
        f.onReturn = b[9] === 1 ? clinitDone(f.m.cls) : null;
        (b[10] as Enc[]).forEach((v, i) => (f.locals[i] = this.value(v)));
        (b[11] as Enc[]).forEach((v, i) => (f.stack[i] = this.value(v)));
        break;
      }
      case 'a':
        (o as unknown[]).push(...this.values(b[1]));
        break;
      case 'P': {
        const fields = b[1] as { [k: string]: Enc };
        for (const k of Object.keys(fields)) o[k] = this.value(fields[k]);
        break;
      }
      default:
        break;
    }
  }
}

/** Restores a save state into `emu`, which must be freshly constructed for the same game and not started. */
export function loadState(emu: Emulator, data: Uint8Array) {
  const { header, blobs } = unpack(data);
  if (header.game !== emu.id) throw new Error(`存档属于「${header.game}」，与当前游戏不符`);
  const vm = emu.vm;
  // games compare saved timestamps with the clock; a sped-up clock must not run backwards across the restore
  if (header.vm.clock !== undefined) vm.advanceClockTo(header.vm.clock);
  for (const [name] of header.classes) {
    if (name[0] === '[') vm.arrayClass(name.slice(1));
    else vm.loadClass(name);
  }
  const d = new Decoder(emu, header.objs, blobs, [emu.midp.screen]);
  for (const [name, state, statics, initThread, classObj] of header.classes) {
    const cls = d.cls(name);
    cls.state = state;
    cls.statics = d.values(statics);
    cls.initThread = d.value(initThread);
    cls.classObj = d.value(classObj);
  }
  vm.interned.clear();
  for (const [s, o] of header.interned) vm.interned.set(s, d.value(o));
  vm.icount = header.vm.icount;
  vm.hashSeed = header.vm.hashSeed;
  vm.nextThreadId = header.vm.nextThreadId;
  vm.consoleBuf[1] = header.vm.console[0];
  vm.consoleBuf[2] = header.vm.console[1];
  vm.threads.length = 0;
  for (const t of d.values(header.threads) as JThread[]) {
    // the pending promise of Host.waitEvent died with the old VM: re-execute the call
    if (t.state === TState.BlockedNative && blockedNative(t) === WAIT_EVENT) {
      t.top!.pc = t.top!.invPc;
      t.state = TState.Runnable;
    }
    vm.threads.push(t);
  }
  emu.rms.importJson(header.rms);
  emu.midp.loadState(d.value(header.midp) as MidpState);
  emu.midp.onPresent?.(emu.midp.screen);
  vm.kick();
}
