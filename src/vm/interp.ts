import { CpTag } from './classfile';
import { BLOCK, INVOKED, RETRY, type JVM } from './jvm';
import { monitorEnter, monitorExit } from './monitor';
import {
  ACC_SUPER,
  ClassState,
  Frame,
  JArray,
  JavaThrow,
  JObject,
  NO_OVERRIDE,
  TState,
  VMError,
  type JThread,
  type JValue,
  type RtClass,
  type RtField,
  type RtMethod,
} from './runtime';

const I32_MAX = 2147483647;
const I32_MIN = -2147483648;
const I64_MAX = 0x7fffffffffffffffn;
const I64_MIN = -0x8000000000000000n;
const TWO63 = 9223372036854775808;

const f2i = (v: number) => (v !== v ? 0 : v >= I32_MAX ? I32_MAX : v <= I32_MIN ? I32_MIN : Math.trunc(v) | 0);
const f2l = (v: number) => (v !== v ? 0n : v >= TWO63 ? I64_MAX : v <= -TWO63 ? I64_MIN : BigInt(Math.trunc(v)));
const fcmp = (a: number, b: number, nan: number) => (a > b ? 1 : a < b ? -1 : a === b ? 0 : nan);

// ---------------------------------------------------------------------------
// constant pool resolution (cached per class)
// ---------------------------------------------------------------------------

function cpUtf8(cls: RtClass, idx: number): string {
  const e = cls.cf!.cp[idx];
  if (!e || e.tag !== CpTag.Utf8) throw new VMError(`${cls.name}: cp #${idx} is not Utf8`);
  return e.value;
}

function cpClassName(cls: RtClass, idx: number): string {
  const e = cls.cf!.cp[idx];
  if (!e || e.tag !== CpTag.Class) throw new VMError(`${cls.name}: cp #${idx} is not Class`);
  return cpUtf8(cls, e.nameIndex);
}

function cpMember(cls: RtClass, idx: number): [string, string, string] {
  const e = cls.cf!.cp[idx];
  if (!e || (e.tag !== CpTag.Fieldref && e.tag !== CpTag.Methodref && e.tag !== CpTag.InterfaceMethodref)) {
    throw new VMError(`${cls.name}: cp #${idx} is not a member ref`);
  }
  const nat = cls.cf!.cp[e.natIndex];
  if (!nat || nat.tag !== CpTag.NameAndType) throw new VMError(`${cls.name}: bad NameAndType`);
  return [cpClassName(cls, e.classIndex), cpUtf8(cls, nat.nameIndex), cpUtf8(cls, nat.descIndex)];
}

function resolveClass(vm: JVM, cls: RtClass, idx: number): RtClass {
  let r = cls.cpCache[idx];
  if (r === undefined) r = cls.cpCache[idx] = vm.loadClass(cpClassName(cls, idx));
  return r;
}

function resolveField(vm: JVM, cls: RtClass, idx: number): RtField {
  let r = cls.cpCache[idx];
  if (r === undefined) {
    const [cn, name, desc] = cpMember(cls, idx);
    r = cls.cpCache[idx] = vm.resolveField(vm.loadClass(cn), name, desc);
  }
  return r;
}

function resolveMethod(vm: JVM, cls: RtClass, idx: number): RtMethod {
  let r = cls.cpCache[idx];
  if (r === undefined) {
    const [cn, name, desc] = cpMember(cls, idx);
    r = cls.cpCache[idx] = vm.resolveMethod(vm.loadClass(cn), name, desc);
  }
  return r;
}

function resolveLdc(vm: JVM, cls: RtClass, idx: number): JValue {
  let r = cls.cpCache[idx];
  if (r === undefined) {
    const e = cls.cf!.cp[idx]!;
    switch (e.tag) {
      case CpTag.Integer:
      case CpTag.Long:
      case CpTag.Double:
        r = e.value;
        break;
      case CpTag.Float:
        r = Math.fround(e.value);
        break;
      case CpTag.String:
        r = vm.intern(cpUtf8(cls, e.stringIndex));
        break;
      case CpTag.Class:
        r = vm.classObject(vm.loadClass(cpUtf8(cls, e.nameIndex)));
        break;
      default:
        throw new VMError(`${cls.name}: unsupported ldc tag ${e.tag}`);
    }
    cls.cpCache[idx] = r;
  }
  return r;
}

function arrayComponentDesc(name: string) {
  return name[0] === '[' ? name : `L${name};`;
}

const NEWARRAY_TYPES: Record<number, string> = { 4: 'Z', 5: 'C', 6: 'F', 7: 'D', 8: 'B', 9: 'S', 10: 'I', 11: 'J' };

// ---------------------------------------------------------------------------
// exceptions
// ---------------------------------------------------------------------------

function catchMatches(vm: JVM, m: RtMethod, catchType: string | null, ex: JObject): boolean {
  if (catchType === null) return true;
  try {
    return vm.isAssignable(ex.cls, vm.loadClass(catchType));
  } catch {
    return false;
  }
}

/** Unwinds `t` until a handler for `ex` is found (top frame pc must point at the faulting instruction). */
export function dispatchException(vm: JVM, t: JThread, ex: JObject) {
  let first = true;
  while (t.frames.length > 0) {
    const f = t.frames[t.frames.length - 1];
    const pc = first ? f.pc : f.invPc;
    first = false;
    for (const h of f.m.exTable) {
      if (pc >= h.startPc && pc < h.endPc && catchMatches(vm, f.m, h.catchType, ex)) {
        f.pc = h.handlerPc;
        f.sp = 0;
        f.stack[f.sp++] = ex;
        return;
      }
    }
    if (f.syncObj) monitorExit(t, f.syncObj);
    if (f.m.name === '<clinit>') {
      f.m.cls.state = ClassState.Error;
      f.m.cls.initThread = null;
    }
    t.frames.pop();
  }
  vm.threadDied(t, ex);
}

// ---------------------------------------------------------------------------
// invocation
// ---------------------------------------------------------------------------

/** call depth at which StackOverflowError is raised (frames live on the JS heap, so nothing else bounds it) */
const MAX_FRAMES = 4000;

const enum Next {
  SameFrame = 0,
  Reload = 1,
}

function invoke(vm: JVM, t: JThread, f: Frame, m: RtMethod, sp: number, opPc: number, nextPc: number): Next {
  const S = f.stack;
  const base = sp - m.argSlots;
  let lockObj: JObject | null = null;
  if (m.isSync) {
    lockObj = m.isStatic ? vm.classObject(m.cls) : (S[base] as JObject);
    if (!monitorEnter(t, lockObj)) {
      t.state = TState.BlockedMonitor;
      t.blockMon = lockObj.mon;
      f.pc = opPc;
      f.sp = sp;
      return Next.Reload;
    }
  }
  if (m.code === null) {
    const fn = m.native;
    if (!fn) {
      if (lockObj) monitorExit(t, lockObj);
      if (m.isAbstract) vm.throwNew('java/lang/AbstractMethodError', `${m.cls.javaName}.${m.key}`);
      vm.throwNew('java/lang/UnsatisfiedLinkError', `${m.cls.javaName}.${m.key}`);
    }
    const args: JValue[] = [];
    let p = base;
    if (!m.isStatic) args.push(S[p++]);
    for (const w of m.sig.wide) {
      args.push(S[p]);
      p += w ? 2 : 1;
    }
    f.pc = nextPc;
    f.sp = base;
    f.invPc = opPc;
    let r: any;
    try {
      r = fn(t, args);
    } finally {
      if (lockObj) monitorExit(t, lockObj);
    }
    if (r === BLOCK || r === INVOKED) return Next.Reload;
    if (r === RETRY) {
      f.pc = opPc;
      f.sp = sp;
      return Next.Reload;
    }
    const k = m.sig.ret.charCodeAt(0);
    if (k === 86 /* V */) return Next.SameFrame;
    if (k === 74 /* J */ || k === 68 /* D */) {
      S[f.sp++] = r;
      S[f.sp++] = undefined;
    } else if (typeof r === 'boolean') {
      S[f.sp++] = r ? 1 : 0;
    } else {
      S[f.sp++] = r === undefined ? null : r;
    }
    return Next.SameFrame;
  }
  if (t.frames.length >= MAX_FRAMES) {
    if (lockObj) monitorExit(t, lockObj);
    vm.throwNew('java/lang/StackOverflowError');
  }
  const nf = new Frame(m);
  const L = nf.locals;
  for (let i = 0; i < m.argSlots; i++) L[i] = S[base + i];
  nf.syncObj = lockObj;
  f.pc = nextPc;
  f.sp = base;
  f.invPc = opPc;
  t.frames.push(nf);
  return Next.Reload;
}

/** Pops `f` and delivers its return value to the caller. */
function doReturn(vm: JVM, t: JThread, f: Frame, v: JValue, kind: 0 | 1 | 2) {
  t.frames.pop();
  if (f.syncObj) monitorExit(t, f.syncObj);
  if (f.onReturn) f.onReturn();
  const caller = t.frames[t.frames.length - 1];
  if (!caller) {
    vm.threadDied(t, null);
    return;
  }
  if (f.retOverride !== NO_OVERRIDE) {
    caller.stack[caller.sp++] = f.retOverride as JValue;
  } else if (kind === 1) {
    caller.stack[caller.sp++] = v;
  } else if (kind === 2) {
    caller.stack[caller.sp++] = v;
    caller.stack[caller.sp++] = undefined;
  }
}

// ---------------------------------------------------------------------------
// main loop
// ---------------------------------------------------------------------------

export function execute(vm: JVM, t: JThread, budget: number): void {
  const startBudget = budget;
  if (t.resumeThrow) {
    const ex = t.resumeThrow;
    t.resumeThrow = null;
    t.resume = null;
    const top = t.top;
    if (top) top.pc = top.invPc;
    dispatchException(vm, t, ex);
  } else if (t.resume) {
    const { kind, value } = t.resume;
    t.resume = null;
    const top = t.top!;
    if (kind === 'J' || kind === 'D') {
      top.stack[top.sp++] = value;
      top.stack[top.sp++] = undefined;
    } else if (kind !== 'V') {
      top.stack[top.sp++] = typeof value === 'boolean' ? (value ? 1 : 0) : value === undefined ? null : value;
    }
  }

  outer: while (true) {
    if (t.state !== TState.Runnable || vm.paused) break;
    const f = t.frames[t.frames.length - 1];
    if (!f) {
      t.state = TState.Terminated;
      break;
    }
    const m = f.m;
    const cls = m.cls;
    const code = m.code!;
    const L = f.locals;
    const S = f.stack;
    let pc = f.pc;
    let sp = f.sp;
    let opPc = pc;
    try {
      while (true) {
        if (vm.paused || --budget < 0) {
          f.pc = pc;
          f.sp = sp;
          break outer;
        }
        opPc = pc;
        const op = code[pc++];
        switch (op) {
          case 0: // nop
            break;
          case 1:
            S[sp++] = null;
            break;
          case 2:
          case 3:
          case 4:
          case 5:
          case 6:
          case 7:
          case 8:
            S[sp++] = op - 3;
            break;
          case 9:
          case 10:
            S[sp++] = BigInt(op - 9);
            S[sp++] = undefined;
            break;
          case 11:
          case 12:
          case 13:
            S[sp++] = op - 11;
            break;
          case 14:
          case 15:
            S[sp++] = op - 14;
            S[sp++] = undefined;
            break;
          case 16: // bipush
            S[sp++] = (code[pc++] << 24) >> 24;
            break;
          case 17: // sipush
            S[sp++] = ((code[pc] << 24) >> 16) | code[pc + 1];
            pc += 2;
            break;
          case 18: // ldc
            S[sp++] = resolveLdc(vm, cls, code[pc++]);
            break;
          case 19: // ldc_w
            S[sp++] = resolveLdc(vm, cls, (code[pc] << 8) | code[pc + 1]);
            pc += 2;
            break;
          case 20: // ldc2_w
            S[sp++] = resolveLdc(vm, cls, (code[pc] << 8) | code[pc + 1]);
            S[sp++] = undefined;
            pc += 2;
            break;
          case 21: // iload
          case 23: // fload
          case 25: // aload
            S[sp++] = L[code[pc++]];
            break;
          case 22: // lload
          case 24: // dload
            S[sp++] = L[code[pc++]];
            S[sp++] = undefined;
            break;
          case 26:
          case 27:
          case 28:
          case 29:
            S[sp++] = L[op - 26];
            break;
          case 30:
          case 31:
          case 32:
          case 33:
            S[sp++] = L[op - 30];
            S[sp++] = undefined;
            break;
          case 34:
          case 35:
          case 36:
          case 37:
            S[sp++] = L[op - 34];
            break;
          case 38:
          case 39:
          case 40:
          case 41:
            S[sp++] = L[op - 38];
            S[sp++] = undefined;
            break;
          case 42:
          case 43:
          case 44:
          case 45:
            S[sp++] = L[op - 42];
            break;
          case 46: // iaload
          case 48: // faload
          case 50: // aaload
          case 51: // baload
          case 52: // caload
          case 53: {
            // saload
            const idx = S[--sp] as number;
            const arr = S[--sp] as JArray | null;
            if (arr === null) vm.throwNew('java/lang/NullPointerException');
            if (idx >>> 0 >= arr.data.length) vm.throwNew('java/lang/ArrayIndexOutOfBoundsException', String(idx));
            S[sp++] = arr.data[idx] as JValue;
            break;
          }
          case 47: // laload
          case 49: {
            // daload
            const idx = S[--sp] as number;
            const arr = S[--sp] as JArray | null;
            if (arr === null) vm.throwNew('java/lang/NullPointerException');
            if (idx >>> 0 >= arr.data.length) vm.throwNew('java/lang/ArrayIndexOutOfBoundsException', String(idx));
            S[sp++] = arr.data[idx] as JValue;
            S[sp++] = undefined;
            break;
          }
          case 54: // istore
          case 56: // fstore
          case 58: // astore
            L[code[pc++]] = S[--sp];
            break;
          case 55: // lstore
          case 57: // dstore
            sp -= 2;
            L[code[pc++]] = S[sp];
            break;
          case 59:
          case 60:
          case 61:
          case 62:
            L[op - 59] = S[--sp];
            break;
          case 63:
          case 64:
          case 65:
          case 66:
            sp -= 2;
            L[op - 63] = S[sp];
            break;
          case 67:
          case 68:
          case 69:
          case 70:
            L[op - 67] = S[--sp];
            break;
          case 71:
          case 72:
          case 73:
          case 74:
            sp -= 2;
            L[op - 71] = S[sp];
            break;
          case 75:
          case 76:
          case 77:
          case 78:
            L[op - 75] = S[--sp];
            break;
          case 79: // iastore
          case 81: // fastore
          case 84: // bastore
          case 85: // castore
          case 86: {
            // sastore
            const v = S[--sp] as number;
            const idx = S[--sp] as number;
            const arr = S[--sp] as JArray | null;
            if (arr === null) vm.throwNew('java/lang/NullPointerException');
            if (idx >>> 0 >= arr.data.length) vm.throwNew('java/lang/ArrayIndexOutOfBoundsException', String(idx));
            (arr.data as Int32Array)[idx] = v;
            break;
          }
          case 80: // lastore
          case 82: {
            // dastore
            sp -= 2;
            const v = S[sp];
            const idx = S[--sp] as number;
            const arr = S[--sp] as JArray | null;
            if (arr === null) vm.throwNew('java/lang/NullPointerException');
            if (idx >>> 0 >= arr.data.length) vm.throwNew('java/lang/ArrayIndexOutOfBoundsException', String(idx));
            (arr.data as any)[idx] = v;
            break;
          }
          case 83: {
            // aastore
            const v = S[--sp] as JObject | null;
            const idx = S[--sp] as number;
            const arr = S[--sp] as JArray | null;
            if (arr === null) vm.throwNew('java/lang/NullPointerException');
            if (idx >>> 0 >= arr.data.length) vm.throwNew('java/lang/ArrayIndexOutOfBoundsException', String(idx));
            if (v !== null) {
              const comp = arr.cls.componentType!;
              if (v.cls !== comp && !vm.isAssignable(v.cls, comp)) {
                vm.throwNew('java/lang/ArrayStoreException', v.cls.javaName);
              }
            }
            (arr.data as (JObject | null)[])[idx] = v;
            break;
          }
          case 87: // pop
            sp--;
            break;
          case 88: // pop2
            sp -= 2;
            break;
          case 89: // dup
            S[sp] = S[sp - 1];
            sp++;
            break;
          case 90: {
            // dup_x1
            const v1 = S[sp - 1];
            const v2 = S[sp - 2];
            S[sp - 2] = v1;
            S[sp - 1] = v2;
            S[sp++] = v1;
            break;
          }
          case 91: {
            // dup_x2
            const v1 = S[sp - 1];
            const v2 = S[sp - 2];
            const v3 = S[sp - 3];
            S[sp - 3] = v1;
            S[sp - 2] = v3;
            S[sp - 1] = v2;
            S[sp++] = v1;
            break;
          }
          case 92: // dup2
            S[sp] = S[sp - 2];
            S[sp + 1] = S[sp - 1];
            sp += 2;
            break;
          case 93: {
            // dup2_x1
            const v1 = S[sp - 1];
            const v2 = S[sp - 2];
            const v3 = S[sp - 3];
            S[sp - 3] = v2;
            S[sp - 2] = v1;
            S[sp - 1] = v3;
            S[sp] = v2;
            S[sp + 1] = v1;
            sp += 2;
            break;
          }
          case 94: {
            // dup2_x2
            const v1 = S[sp - 1];
            const v2 = S[sp - 2];
            const v3 = S[sp - 3];
            const v4 = S[sp - 4];
            S[sp - 4] = v2;
            S[sp - 3] = v1;
            S[sp - 2] = v4;
            S[sp - 1] = v3;
            S[sp] = v2;
            S[sp + 1] = v1;
            sp += 2;
            break;
          }
          case 95: {
            // swap
            const v = S[sp - 1];
            S[sp - 1] = S[sp - 2];
            S[sp - 2] = v;
            break;
          }
          // ---- arithmetic ----
          case 96:
            sp--;
            S[sp - 1] = ((S[sp - 1] as number) + (S[sp] as number)) | 0;
            break;
          case 97:
            sp -= 2;
            S[sp - 2] = BigInt.asIntN(64, (S[sp - 2] as bigint) + (S[sp] as bigint));
            break;
          case 98:
            sp--;
            S[sp - 1] = Math.fround((S[sp - 1] as number) + (S[sp] as number));
            break;
          case 99:
            sp -= 2;
            S[sp - 2] = (S[sp - 2] as number) + (S[sp] as number);
            break;
          case 100:
            sp--;
            S[sp - 1] = ((S[sp - 1] as number) - (S[sp] as number)) | 0;
            break;
          case 101:
            sp -= 2;
            S[sp - 2] = BigInt.asIntN(64, (S[sp - 2] as bigint) - (S[sp] as bigint));
            break;
          case 102:
            sp--;
            S[sp - 1] = Math.fround((S[sp - 1] as number) - (S[sp] as number));
            break;
          case 103:
            sp -= 2;
            S[sp - 2] = (S[sp - 2] as number) - (S[sp] as number);
            break;
          case 104:
            sp--;
            S[sp - 1] = Math.imul(S[sp - 1] as number, S[sp] as number);
            break;
          case 105:
            sp -= 2;
            S[sp - 2] = BigInt.asIntN(64, (S[sp - 2] as bigint) * (S[sp] as bigint));
            break;
          case 106:
            sp--;
            S[sp - 1] = Math.fround((S[sp - 1] as number) * (S[sp] as number));
            break;
          case 107:
            sp -= 2;
            S[sp - 2] = (S[sp - 2] as number) * (S[sp] as number);
            break;
          case 108: {
            const b = S[--sp] as number;
            if (b === 0) vm.throwNew('java/lang/ArithmeticException', '/ by zero');
            S[sp - 1] = ((S[sp - 1] as number) / b) | 0;
            break;
          }
          case 109: {
            sp -= 2;
            const b = S[sp] as bigint;
            if (b === 0n) vm.throwNew('java/lang/ArithmeticException', '/ by zero');
            S[sp - 2] = BigInt.asIntN(64, (S[sp - 2] as bigint) / b);
            break;
          }
          case 110:
            sp--;
            S[sp - 1] = Math.fround((S[sp - 1] as number) / (S[sp] as number));
            break;
          case 111:
            sp -= 2;
            S[sp - 2] = (S[sp - 2] as number) / (S[sp] as number);
            break;
          case 112: {
            const b = S[--sp] as number;
            if (b === 0) vm.throwNew('java/lang/ArithmeticException', '/ by zero');
            S[sp - 1] = (S[sp - 1] as number) % b | 0;
            break;
          }
          case 113: {
            sp -= 2;
            const b = S[sp] as bigint;
            if (b === 0n) vm.throwNew('java/lang/ArithmeticException', '/ by zero');
            S[sp - 2] = (S[sp - 2] as bigint) % b;
            break;
          }
          case 114:
            sp--;
            S[sp - 1] = Math.fround((S[sp - 1] as number) % (S[sp] as number));
            break;
          case 115:
            sp -= 2;
            S[sp - 2] = (S[sp - 2] as number) % (S[sp] as number);
            break;
          case 116:
            S[sp - 1] = -(S[sp - 1] as number) | 0;
            break;
          case 117:
            S[sp - 2] = BigInt.asIntN(64, -(S[sp - 2] as bigint));
            break;
          case 118:
            S[sp - 1] = -(S[sp - 1] as number);
            break;
          case 119:
            S[sp - 2] = -(S[sp - 2] as number);
            break;
          case 120:
            sp--;
            S[sp - 1] = (S[sp - 1] as number) << (S[sp] as number);
            break;
          case 121: {
            const s = S[--sp] as number;
            S[sp - 2] = BigInt.asIntN(64, (S[sp - 2] as bigint) << BigInt(s & 63));
            break;
          }
          case 122:
            sp--;
            S[sp - 1] = (S[sp - 1] as number) >> (S[sp] as number);
            break;
          case 123: {
            const s = S[--sp] as number;
            S[sp - 2] = (S[sp - 2] as bigint) >> BigInt(s & 63);
            break;
          }
          case 124:
            sp--;
            S[sp - 1] = ((S[sp - 1] as number) >>> (S[sp] as number)) | 0;
            break;
          case 125: {
            const s = S[--sp] as number;
            S[sp - 2] = BigInt.asIntN(64, BigInt.asUintN(64, S[sp - 2] as bigint) >> BigInt(s & 63));
            break;
          }
          case 126:
            sp--;
            S[sp - 1] = (S[sp - 1] as number) & (S[sp] as number);
            break;
          case 127:
            sp -= 2;
            S[sp - 2] = (S[sp - 2] as bigint) & (S[sp] as bigint);
            break;
          case 128:
            sp--;
            S[sp - 1] = (S[sp - 1] as number) | (S[sp] as number);
            break;
          case 129:
            sp -= 2;
            S[sp - 2] = (S[sp - 2] as bigint) | (S[sp] as bigint);
            break;
          case 130:
            sp--;
            S[sp - 1] = (S[sp - 1] as number) ^ (S[sp] as number);
            break;
          case 131:
            sp -= 2;
            S[sp - 2] = (S[sp - 2] as bigint) ^ (S[sp] as bigint);
            break;
          case 132: {
            // iinc
            const idx = code[pc];
            L[idx] = ((L[idx] as number) + ((code[pc + 1] << 24) >> 24)) | 0;
            pc += 2;
            break;
          }
          // ---- conversions ----
          case 133: // i2l
            S[sp - 1] = BigInt(S[sp - 1] as number);
            S[sp++] = undefined;
            break;
          case 134: // i2f
            S[sp - 1] = Math.fround(S[sp - 1] as number);
            break;
          case 135: // i2d
            S[sp++] = undefined;
            break;
          case 136: // l2i
            sp--;
            S[sp - 1] = Number(BigInt.asIntN(32, S[sp - 1] as bigint));
            break;
          case 137: // l2f
            sp--;
            S[sp - 1] = Math.fround(Number(S[sp - 1] as bigint));
            break;
          case 138: // l2d
            S[sp - 2] = Number(S[sp - 2] as bigint);
            break;
          case 139: // f2i
            S[sp - 1] = f2i(S[sp - 1] as number);
            break;
          case 140: // f2l
            S[sp - 1] = f2l(S[sp - 1] as number);
            S[sp++] = undefined;
            break;
          case 141: // f2d
            S[sp++] = undefined;
            break;
          case 142: // d2i
            sp--;
            S[sp - 1] = f2i(S[sp - 1] as number);
            break;
          case 143: // d2l
            S[sp - 2] = f2l(S[sp - 2] as number);
            break;
          case 144: // d2f
            sp--;
            S[sp - 1] = Math.fround(S[sp - 1] as number);
            break;
          case 145: // i2b
            S[sp - 1] = ((S[sp - 1] as number) << 24) >> 24;
            break;
          case 146: // i2c
            S[sp - 1] = (S[sp - 1] as number) & 0xffff;
            break;
          case 147: // i2s
            S[sp - 1] = ((S[sp - 1] as number) << 16) >> 16;
            break;
          case 148: {
            // lcmp
            sp -= 4;
            const a = S[sp] as bigint;
            const b = S[sp + 2] as bigint;
            S[sp++] = a > b ? 1 : a < b ? -1 : 0;
            break;
          }
          case 149:
          case 150:
            sp--;
            S[sp - 1] = fcmp(S[sp - 1] as number, S[sp] as number, op === 149 ? -1 : 1);
            break;
          case 151:
          case 152:
            sp -= 4;
            S[sp] = fcmp(S[sp] as number, S[sp + 2] as number, op === 151 ? -1 : 1);
            sp++;
            break;
          // ---- branches ----
          case 153:
          case 154:
          case 155:
          case 156:
          case 157:
          case 158: {
            const v = S[--sp] as number;
            const taken =
              op === 153 ? v === 0 : op === 154 ? v !== 0 : op === 155 ? v < 0 : op === 156 ? v >= 0 : op === 157 ? v > 0 : v <= 0;
            pc = taken ? opPc + (((code[pc] << 24) >> 16) | code[pc + 1]) : pc + 2;
            break;
          }
          case 159:
          case 160:
          case 161:
          case 162:
          case 163:
          case 164: {
            const b = S[--sp] as number;
            const a = S[--sp] as number;
            const taken =
              op === 159 ? a === b : op === 160 ? a !== b : op === 161 ? a < b : op === 162 ? a >= b : op === 163 ? a > b : a <= b;
            pc = taken ? opPc + (((code[pc] << 24) >> 16) | code[pc + 1]) : pc + 2;
            break;
          }
          case 165:
          case 166: {
            const b = S[--sp];
            const a = S[--sp];
            const taken = op === 165 ? a === b : a !== b;
            pc = taken ? opPc + (((code[pc] << 24) >> 16) | code[pc + 1]) : pc + 2;
            break;
          }
          case 167: // goto
            pc = opPc + (((code[pc] << 24) >> 16) | code[pc + 1]);
            break;
          case 168: // jsr
            S[sp++] = pc + 2;
            pc = opPc + (((code[pc] << 24) >> 16) | code[pc + 1]);
            break;
          case 169: // ret
            pc = L[code[pc]] as number;
            break;
          case 170: {
            // tableswitch
            let p = (opPc + 4) & ~3;
            const def = s4(code, p);
            const lo = s4(code, p + 4);
            const hi = s4(code, p + 8);
            const key = S[--sp] as number;
            pc = opPc + (key < lo || key > hi ? def : s4(code, p + 12 + (key - lo) * 4));
            break;
          }
          case 171: {
            // lookupswitch
            const p = (opPc + 4) & ~3;
            const def = s4(code, p);
            const n = s4(code, p + 4);
            const key = S[--sp] as number;
            let target = def;
            let lo = 0;
            let hi = n - 1;
            while (lo <= hi) {
              const mid = (lo + hi) >> 1;
              const mk = s4(code, p + 8 + mid * 8);
              if (mk === key) {
                target = s4(code, p + 12 + mid * 8);
                break;
              }
              if (mk < key) lo = mid + 1;
              else hi = mid - 1;
            }
            pc = opPc + target;
            break;
          }
          case 172: // ireturn
          case 174: // freturn
          case 176: // areturn
            doReturn(vm, t, f, S[sp - 1], 1);
            continue outer;
          case 173: // lreturn
          case 175: // dreturn
            doReturn(vm, t, f, S[sp - 2], 2);
            continue outer;
          case 177: // return
            doReturn(vm, t, f, undefined, 0);
            continue outer;
          // ---- fields ----
          case 178: {
            // getstatic
            const fld = resolveField(vm, cls, (code[pc] << 8) | code[pc + 1]);
            if (fld.cls.state !== ClassState.Initialized && !vm.ensureInit(t, fld.cls)) {
              f.pc = opPc;
              f.sp = sp;
              continue outer;
            }
            pc += 2;
            S[sp++] = fld.cls.statics[fld.slot];
            if (fld.wide) S[sp++] = undefined;
            break;
          }
          case 179: {
            // putstatic
            const fld = resolveField(vm, cls, (code[pc] << 8) | code[pc + 1]);
            if (fld.cls.state !== ClassState.Initialized && !vm.ensureInit(t, fld.cls)) {
              f.pc = opPc;
              f.sp = sp;
              continue outer;
            }
            pc += 2;
            if (fld.wide) sp--;
            fld.cls.statics[fld.slot] = S[--sp];
            break;
          }
          case 180: {
            // getfield
            const fld = resolveField(vm, cls, (code[pc] << 8) | code[pc + 1]);
            pc += 2;
            const o = S[sp - 1] as JObject | null;
            if (o === null) vm.throwNew('java/lang/NullPointerException', `getfield ${fld.name}`);
            S[sp - 1] = o.f[fld.slot];
            if (fld.wide) S[sp++] = undefined;
            break;
          }
          case 181: {
            // putfield
            const fld = resolveField(vm, cls, (code[pc] << 8) | code[pc + 1]);
            pc += 2;
            if (fld.wide) sp--;
            const v = S[--sp];
            const o = S[--sp] as JObject | null;
            if (o === null) vm.throwNew('java/lang/NullPointerException', `putfield ${fld.name}`);
            o.f[fld.slot] = v;
            break;
          }
          // ---- invocation ----
          case 182: // invokevirtual
          case 185: {
            // invokeinterface
            const rm = resolveMethod(vm, cls, (code[pc] << 8) | code[pc + 1]);
            const next = pc + (op === 185 ? 4 : 2);
            const recv = S[sp - rm.argSlots] as JObject | null;
            if (recv === null) vm.throwNew('java/lang/NullPointerException', `${rm.cls.javaName}.${rm.name}`);
            const target = recv.cls === rm.cls && (rm.access & 0x0012) !== 0 ? rm : vm.findVirtual(recv.cls, rm.key);
            if (invoke(vm, t, f, target, sp, opPc, next) === Next.Reload) continue outer;
            pc = f.pc;
            sp = f.sp;
            break;
          }
          case 183: {
            // invokespecial
            let target = resolveMethod(vm, cls, (code[pc] << 8) | code[pc + 1]);
            if (S[sp - target.argSlots] === null) vm.throwNew('java/lang/NullPointerException', target.name);
            if (
              target.name !== '<init>' &&
              (cls.access & ACC_SUPER) !== 0 &&
              target.cls !== cls &&
              !target.cls.isInterface &&
              cls.superClass &&
              vm.isAssignable(cls.superClass, target.cls)
            ) {
              target = vm.findVirtual(cls.superClass, target.key);
            }
            if (invoke(vm, t, f, target, sp, opPc, pc + 2) === Next.Reload) continue outer;
            pc = f.pc;
            sp = f.sp;
            break;
          }
          case 184: {
            // invokestatic
            const target = resolveMethod(vm, cls, (code[pc] << 8) | code[pc + 1]);
            if (target.cls.state !== ClassState.Initialized && !vm.ensureInit(t, target.cls)) {
              f.pc = opPc;
              f.sp = sp;
              continue outer;
            }
            if (invoke(vm, t, f, target, sp, opPc, pc + 2) === Next.Reload) continue outer;
            pc = f.pc;
            sp = f.sp;
            break;
          }
          case 186:
            throw new VMError(`invokedynamic is not supported (${cls.name}.${m.name})`);
          // ---- objects ----
          case 187: {
            // new
            const c = resolveClass(vm, cls, (code[pc] << 8) | code[pc + 1]);
            if (c.state !== ClassState.Initialized && !vm.ensureInit(t, c)) {
              f.pc = opPc;
              f.sp = sp;
              continue outer;
            }
            if (c.isInterface || (c.access & 0x0400) !== 0) vm.throwNew('java/lang/InstantiationError', c.javaName);
            pc += 2;
            S[sp++] = vm.newObject(c);
            break;
          }
          case 188: // newarray
            S[sp - 1] = vm.newArray(NEWARRAY_TYPES[code[pc++]], S[sp - 1] as number);
            break;
          case 189: {
            // anewarray
            const c = resolveClass(vm, cls, (code[pc] << 8) | code[pc + 1]);
            pc += 2;
            S[sp - 1] = vm.newArray(arrayComponentDesc(c.name), S[sp - 1] as number);
            break;
          }
          case 190: {
            // arraylength
            const arr = S[sp - 1] as JArray | null;
            if (arr === null) vm.throwNew('java/lang/NullPointerException', 'arraylength');
            S[sp - 1] = arr.data.length;
            break;
          }
          case 191: {
            // athrow
            const ex = S[sp - 1] as JObject | null;
            if (ex === null) vm.throwNew('java/lang/NullPointerException', 'athrow');
            throw new JavaThrow(ex);
          }
          case 192: {
            // checkcast
            const c = resolveClass(vm, cls, (code[pc] << 8) | code[pc + 1]);
            const o = S[sp - 1] as JObject | null;
            if (o !== null && o.cls !== c && !vm.isAssignable(o.cls, c)) {
              vm.throwNew('java/lang/ClassCastException', `${o.cls.javaName} cannot be cast to ${c.javaName}`);
            }
            pc += 2;
            break;
          }
          case 193: {
            // instanceof
            const c = resolveClass(vm, cls, (code[pc] << 8) | code[pc + 1]);
            const o = S[sp - 1] as JObject | null;
            S[sp - 1] = o !== null && (o.cls === c || vm.isAssignable(o.cls, c)) ? 1 : 0;
            pc += 2;
            break;
          }
          case 194: {
            // monitorenter
            const o = S[sp - 1] as JObject | null;
            if (o === null) vm.throwNew('java/lang/NullPointerException', 'monitorenter');
            if (!monitorEnter(t, o)) {
              t.state = TState.BlockedMonitor;
              t.blockMon = o.mon;
              f.pc = opPc;
              f.sp = sp;
              continue outer;
            }
            sp--;
            break;
          }
          case 195: {
            // monitorexit
            const o = S[--sp] as JObject | null;
            if (o === null) vm.throwNew('java/lang/NullPointerException', 'monitorexit');
            monitorExit(t, o);
            break;
          }
          case 196: {
            // wide
            const wop = code[pc];
            const idx = (code[pc + 1] << 8) | code[pc + 2];
            pc += 3;
            switch (wop) {
              case 21:
              case 23:
              case 25:
                S[sp++] = L[idx];
                break;
              case 22:
              case 24:
                S[sp++] = L[idx];
                S[sp++] = undefined;
                break;
              case 54:
              case 56:
              case 58:
                L[idx] = S[--sp];
                break;
              case 55:
              case 57:
                sp -= 2;
                L[idx] = S[sp];
                break;
              case 132:
                L[idx] = ((L[idx] as number) + (((code[pc] << 24) >> 16) | code[pc + 1])) | 0;
                pc += 2;
                break;
              case 169:
                pc = L[idx] as number;
                break;
              default:
                throw new VMError(`bad wide opcode ${wop}`);
            }
            break;
          }
          case 197: {
            // multianewarray
            const c = resolveClass(vm, cls, (code[pc] << 8) | code[pc + 1]);
            const n = code[pc + 2];
            pc += 3;
            sp -= n;
            const dims: number[] = [];
            for (let i = 0; i < n; i++) dims.push(S[sp + i] as number);
            S[sp++] = vm.newMultiArray(c.name, dims);
            break;
          }
          case 198: // ifnull
          case 199: {
            // ifnonnull
            const v = S[--sp];
            const taken = op === 198 ? v === null : v !== null;
            pc = taken ? opPc + (((code[pc] << 24) >> 16) | code[pc + 1]) : pc + 2;
            break;
          }
          case 200: // goto_w
            pc = opPc + s4(code, pc);
            break;
          case 201: // jsr_w
            S[sp++] = pc + 4;
            pc = opPc + s4(code, pc);
            break;
          default:
            throw new VMError(`unknown opcode ${op} at ${cls.name}.${m.name}@${opPc}`);
        }
      }
    } catch (e) {
      if (!(e instanceof JavaThrow)) {
        if (e instanceof RangeError && /call stack/i.test(e.message)) {
          f.pc = opPc;
          f.sp = sp;
          dispatchException(vm, t, vm.newThrowable('java/lang/StackOverflowError', null, t));
          continue;
        }
        if (e instanceof Error) e.message += ` [at ${cls.name}.${m.name}${m.desc} pc=${opPc}]`;
        throw e;
      }
      // a native may have pushed frames before throwing; drop them
      while (t.frames.length > 0 && t.frames[t.frames.length - 1] !== f) t.frames.pop();
      f.pc = opPc;
      f.sp = sp;
      dispatchException(vm, t, e.obj);
    }
  }
  vm.icount += startBudget - Math.max(budget, 0);
}

function s4(code: Uint8Array, p: number) {
  return (code[p] << 24) | (code[p + 1] << 16) | (code[p + 2] << 8) | code[p + 3];
}
