/**
 * Cheats: searching the Java heap for numeric values (Cheat Engine style), and cheat codes that address a value
 * by a path from a static field, so they survive restarts and can be shared:
 *
 *   com/foo/Game.inst:Lcom/foo/Game;.player:Lcom/foo/Player;.hp:I
 *   com/foo/Game.money:I
 *   com/foo/Game.items:[I.3
 *
 * Segments are separated by '.'; the first is a class name (or `@<thread name>`), field segments are
 * `name:descriptor` and array elements are plain indexes.
 */
import type { JVM } from './vm/jvm';
import { JArray, JObject, RtClass, type RtField } from './vm/runtime';

export type CellType = 'Z' | 'B' | 'C' | 'S' | 'I' | 'J' | 'F' | 'D';

/** a primitive memory location: a static field, an instance field or an array element */
export interface Cell {
  holder: RtClass | JObject;
  index: number;
  type: CellType;
}

const NUMERIC = new Set(['Z', 'B', 'C', 'S', 'I', 'J', 'F', 'D']);
/** primitive arrays longer than this (resource buffers, big maps) are left out of searches */
const MAX_ARRAY = 1 << 16;

export const TYPE_NAMES: Record<CellType, string> = {
  Z: 'boolean',
  B: 'byte',
  C: 'char',
  S: 'short',
  I: 'int',
  J: 'long',
  F: 'float',
  D: 'double',
};

const layouts = new WeakMap<RtClass, RtField[]>();

/** instance fields of `cls` including inherited ones */
function instanceFields(cls: RtClass): RtField[] {
  let out = layouts.get(cls);
  if (!out) {
    out = [];
    for (let c: RtClass | null = cls; c; c = c.superClass) {
      for (const f of c.fields.values()) if (!f.isStatic) out.push(f);
    }
    layouts.set(cls, out);
  }
  return out;
}

function staticFields(cls: RtClass): RtField[] {
  return [...cls.fields.values()].filter((f) => f.isStatic);
}

function findField(cls: RtClass, key: string, isStatic: boolean): RtField | null {
  for (let c: RtClass | null = cls; c; c = c.superClass) {
    const f = c.fields.get(key);
    if (f && f.isStatic === isStatic) return f;
  }
  return null;
}

function arrayElemType(a: JArray): CellType | null {
  const n = a.cls.name;
  return n.length === 2 && NUMERIC.has(n[1]) ? (n[1] as CellType) : null;
}

export function readCell(c: Cell): number {
  const h = c.holder;
  const v = h instanceof RtClass ? h.statics[c.index] : h instanceof JArray ? h.data[c.index] : h.f[c.index];
  return typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : 0;
}

export function writeCell(c: Cell, value: number) {
  let v: number | bigint;
  switch (c.type) {
    case 'Z':
      v = value ? 1 : 0;
      break;
    case 'B':
      v = (value << 24) >> 24;
      break;
    case 'C':
      v = value & 0xffff;
      break;
    case 'S':
      v = (value << 16) >> 16;
      break;
    case 'I':
      v = value | 0;
      break;
    case 'J':
      v = BigInt.asIntN(64, BigInt(Math.trunc(value)));
      break;
    case 'F':
      v = Math.fround(value);
      break;
    default:
      v = value;
  }
  const h = c.holder;
  if (h instanceof RtClass) h.statics[c.index] = v;
  else if (h instanceof JArray) (h.data as any)[c.index] = v;
  else h.f[c.index] = v;
}

function fieldAt(fields: RtField[], slot: number): RtField | undefined {
  return fields.find((f) => f.slot === slot);
}

/** human-readable location, e.g. `com.foo.Player.hp` or `int[12][3]` */
export function describeCell(c: Cell): string {
  const h = c.holder;
  if (h instanceof RtClass) return `${h.javaName}.${fieldAt(staticFields(h), c.index)?.name ?? `#${c.index}`}`;
  if (h instanceof JArray) return `${TYPE_NAMES[c.type]}[${h.data.length}] [${c.index}]`;
  return `${h.cls.javaName}.${fieldAt(instanceFields(h.cls), c.index)?.name ?? `#${c.index}`}`;
}

/** classes of the game first, then the platform library */
function rootClasses(vm: JVM): RtClass[] {
  const app: RtClass[] = [];
  const boot: RtClass[] = [];
  for (const cls of vm.classes.values()) {
    if (cls.isArray || cls.isPrimitive) continue;
    (vm.app.has(cls.name + '.class') ? app : boot).push(cls);
  }
  return [...app, ...boot];
}

/** visits every numeric cell reachable from statics and thread stacks */
function forEachCell(vm: JVM, fn: (holder: RtClass | JObject, index: number, type: CellType) => void) {
  const seen = new Set<JObject>();
  const stack: JObject[] = [];
  const push = (v: unknown) => {
    if (v instanceof JObject && !seen.has(v)) {
      seen.add(v);
      stack.push(v);
    }
  };
  for (const cls of rootClasses(vm)) {
    for (const f of staticFields(cls)) {
      if (NUMERIC.has(f.desc)) fn(cls, f.slot, f.desc as CellType);
      else push(cls.statics[f.slot]);
    }
  }
  for (const t of vm.threads) {
    push(t.javaThread);
    for (const f of t.frames) {
      for (const v of f.locals) push(v);
      for (let i = 0; i < f.sp; i++) push(f.stack[i]);
    }
  }
  while (stack.length > 0) {
    const o = stack.pop()!;
    if (o instanceof JArray) {
      const type = arrayElemType(o);
      if (type) {
        if (o.data.length <= MAX_ARRAY) for (let i = 0; i < o.data.length; i++) fn(o, i, type);
      } else if (!ArrayBuffer.isView(o.data)) {
        for (const v of o.data) push(v);
      }
      continue;
    }
    for (const f of instanceFields(o.cls)) {
      if (NUMERIC.has(f.desc)) fn(o, f.slot, f.desc as CellType);
      else push(o.f[f.slot]);
    }
  }
}

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

export type ScanMode = 'eq' | 'unknown' | 'inc' | 'dec' | 'changed' | 'unchanged';

export interface ScanResult extends Cell {
  value: number;
  previous: number;
}

const matchesValue = (type: CellType, v: number, target: number) =>
  type === 'F' || type === 'D' ? v === target || Math.round(v) === target : v === target;

export class MemoryScanner {
  private holders: (RtClass | JObject)[] = [];
  private indexes: number[] = [];
  private types: CellType[] = [];
  private values: number[] = [];
  scans = 0;

  constructor(public vm: JVM) {}

  get count() {
    return this.holders.length;
  }

  reset() {
    this.holders = [];
    this.indexes = [];
    this.types = [];
    this.values = [];
    this.scans = 0;
  }

  /** first scan: cells equal to `value`, or every cell when the initial value is unknown */
  first(mode: 'eq' | 'unknown', value = 0) {
    this.reset();
    forEachCell(this.vm, (holder, index, type) => {
      if (type === 'Z') return;
      const v = readCell({ holder, index, type });
      if (mode === 'eq' && !matchesValue(type, v, value)) return;
      this.holders.push(holder);
      this.indexes.push(index);
      this.types.push(type);
      this.values.push(v);
    });
    this.scans = 1;
  }

  /** narrows the candidates by comparing with `value` or with their value at the previous scan */
  next(mode: Exclude<ScanMode, 'unknown'>, value = 0) {
    let n = 0;
    for (let i = 0; i < this.holders.length; i++) {
      const cell: Cell = { holder: this.holders[i], index: this.indexes[i], type: this.types[i] };
      const v = readCell(cell);
      const prev = this.values[i];
      const keep =
        mode === 'eq'
          ? matchesValue(cell.type, v, value)
          : mode === 'inc'
            ? v > prev
            : mode === 'dec'
              ? v < prev
              : mode === 'changed'
                ? v !== prev
                : v === prev;
      if (!keep) continue;
      this.holders[n] = cell.holder;
      this.indexes[n] = cell.index;
      this.types[n] = cell.type;
      this.values[n] = v;
      n++;
    }
    this.holders.length = this.indexes.length = this.types.length = this.values.length = n;
    this.scans++;
  }

  results(limit: number): ScanResult[] {
    const out: ScanResult[] = [];
    for (let i = 0; i < Math.min(limit, this.holders.length); i++) {
      const cell: Cell = { holder: this.holders[i], index: this.indexes[i], type: this.types[i] };
      out.push({ ...cell, value: readCell(cell), previous: this.values[i] });
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// paths
// ---------------------------------------------------------------------------

/** shortest path from a static field (or a thread object) to `cell`; null when only reachable from stack frames */
export function pathOf(vm: JVM, cell: Cell): string | null {
  const h = cell.holder;
  const last = (fields: RtField[]) => {
    const f = fieldAt(fields, cell.index);
    return f ? `${f.name}:${f.desc}` : null;
  };
  if (h instanceof RtClass) {
    const step = last(staticFields(h));
    return step ? `${h.name}.${step}` : null;
  }
  const tail = h instanceof JArray ? String(cell.index) : last(instanceFields(h.cls));
  if (tail === null) return null;
  const parent = new Map<JObject, [JObject | null, string]>();
  const queue: JObject[] = [];
  const visit = (v: unknown, from: JObject | null, step: string) => {
    if (v instanceof JObject && !parent.has(v)) {
      parent.set(v, [from, step]);
      queue.push(v);
    }
  };
  for (const cls of rootClasses(vm)) {
    for (const f of staticFields(cls)) {
      if (f.desc[0] === 'L' || f.desc[0] === '[') visit(cls.statics[f.slot], null, `${cls.name}.${f.name}:${f.desc}`);
    }
  }
  for (const t of vm.threads) if (!t.name.includes('.')) visit(t.javaThread, null, `@${t.name}`);
  for (let qi = 0; qi < queue.length; qi++) {
    const o = queue[qi];
    if (o === h) {
      const steps = [tail];
      for (let cur: JObject | null = o; cur; ) {
        const [from, step]: [JObject | null, string] = parent.get(cur)!;
        steps.push(step);
        cur = from;
      }
      return steps.reverse().join('.');
    }
    if (o instanceof JArray) {
      if (!ArrayBuffer.isView(o.data)) o.data.forEach((v, i) => visit(v, o, String(i)));
      continue;
    }
    for (const f of instanceFields(o.cls)) {
      if (f.desc[0] === 'L' || f.desc[0] === '[') visit(o.f[f.slot], o, `${f.name}:${f.desc}`);
    }
  }
  return null;
}

export function resolvePath(vm: JVM, path: string): Cell | null {
  const segs = path.trim().split('.');
  let cur: unknown;
  let i: number;
  if (segs[0].startsWith('@')) {
    cur = vm.threads.find((t) => t.name === segs[0].slice(1))?.javaThread;
    i = 1;
  } else {
    const cls = vm.classes.get(segs[0]);
    const f = cls && segs.length >= 2 ? findField(cls, segs[1], true) : null;
    if (!cls || !f) return null;
    if (segs.length === 2) return NUMERIC.has(f.desc) ? { holder: f.cls, index: f.slot, type: f.desc as CellType } : null;
    cur = f.cls.statics[f.slot];
    i = 2;
  }
  for (; i < segs.length; i++) {
    if (!(cur instanceof JObject)) return null;
    const seg = segs[i];
    const isLast = i === segs.length - 1;
    if (seg.includes(':')) {
      const f = findField(cur.cls, seg, false);
      if (!f) return null;
      if (isLast) return NUMERIC.has(f.desc) ? { holder: cur, index: f.slot, type: f.desc as CellType } : null;
      cur = cur.f[f.slot];
    } else {
      const idx = Number(seg);
      if (!(cur instanceof JArray) || !Number.isInteger(idx) || idx < 0 || idx >= cur.data.length) return null;
      if (isLast) {
        const type = arrayElemType(cur);
        return type ? { holder: cur, index: idx, type } : null;
      }
      cur = cur.data[idx];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// cheat codes
// ---------------------------------------------------------------------------

export interface Cheat {
  name: string;
  path: string;
  value: number;
  /** rewritten continuously instead of once */
  locked: boolean;
}

const RESOLVE_EVERY_MS = 500;

/** Applies cheats to a VM; locked ones are rewritten before every scheduler tick. */
export class CheatEngine {
  cheats: Cheat[] = [];
  private vm: JVM | null = null;
  private cache = new Map<Cheat, { cell: Cell | null; at: number }>();

  attach(vm: JVM | null) {
    if (this.vm) this.vm.onTick = null;
    this.vm = vm;
    this.cache.clear();
    if (vm) vm.onTick = () => this.tick();
  }

  resolve(c: Cheat, fresh = false): Cell | null {
    if (!this.vm) return null;
    const now = performance.now();
    const hit = this.cache.get(c);
    if (!fresh && hit && now - hit.at < RESOLVE_EVERY_MS) return hit.cell;
    const cell = resolvePath(this.vm, c.path);
    this.cache.set(c, { cell, at: now });
    return cell;
  }

  /** writes the value once; false when the path does not resolve (yet) */
  apply(c: Cheat): boolean {
    const cell = this.resolve(c, true);
    if (cell) writeCell(cell, c.value);
    return !!cell;
  }

  private tick() {
    for (const c of this.cheats) {
      if (!c.locked) continue;
      const cell = this.resolve(c);
      if (cell) writeCell(cell, c.value);
    }
  }
}

/** one cheat per line: `name | value | path [| lock]`; `#` starts a comment */
export function formatCheats(cheats: Cheat[], title?: string): string {
  const lines = title ? [`# JarGame 金手指 · ${title}`] : [];
  for (const c of cheats) lines.push([c.name.replace(/\|/g, '/'), c.value, c.path, ...(c.locked ? ['lock'] : [])].join(' | '));
  return lines.join('\n');
}

export function parseCheats(text: string): Cheat[] {
  const out: Cheat[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [name, value, path, flag] = line.split('|').map((s) => s.trim());
    const v = Number(value);
    if (!path || !Number.isFinite(v)) throw new Error(`无法解析：${line}`);
    out.push({ name: name || path, path, value: v, locked: /^(lock|1|true|锁定)$/i.test(flag ?? '') });
  }
  return out;
}
