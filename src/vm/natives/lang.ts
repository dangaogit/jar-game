import { decodeModifiedUtf8, encodeModifiedUtf8 } from '../classfile';
import { BLOCK, INVOKED, RETRY, type JVM } from '../jvm';
import { JArray, JObject, TState, type JThread, type JValue, type RtClass } from '../runtime';
import {
  charsToString,
  decodeBytes,
  encodeString,
  javaDoubleToString,
  javaFloatToString,
  javaHash,
  normalizeCharset,
  parseJavaDouble,
} from '../text';

const f32 = new Float32Array(1);
const i32 = new Int32Array(f32.buffer);
const f64 = new Float64Array(1);
const i64 = new BigInt64Array(f64.buffer);

export function bytesOf(a: JArray): Uint8Array {
  const d = a.data as Int8Array;
  return new Uint8Array(d.buffer, d.byteOffset, d.length);
}

export function byteArray(vm: JVM, bytes: Uint8Array): JArray {
  const copy = new Int8Array(bytes.length);
  copy.set(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length));
  return vm.wrapArray('B', copy);
}

export function stringArray(vm: JVM, strings: (string | null)[]): JArray {
  const arr = vm.newArray('Ljava/lang/String;', strings.length);
  strings.forEach((s, i) => ((arr.data as (JObject | null)[])[i] = vm.strOrNull(s)));
  return arr;
}

function checkRange(vm: JVM, len: number, off: number, count: number) {
  if (off < 0 || count < 0 || off + count > len) {
    vm.throwNew('java/lang/StringIndexOutOfBoundsException', `offset ${off}, count ${count}, length ${len}`);
  }
}

function nullCheck<T>(vm: JVM, v: T | null | undefined): T {
  if (v == null) vm.throwNew('java/lang/NullPointerException');
  return v;
}

function parseIntRadix(vm: JVM, s: string | null, radix: number, bits: 32 | 64): bigint {
  if (s == null) vm.throwNew('java/lang/NumberFormatException', 'null');
  const fail = (): never => vm.throwNew('java/lang/NumberFormatException', `For input string: "${s}"`);
  if (s.length === 0 || radix < 2 || radix > 36) fail();
  let i = 0;
  let neg = false;
  if (s[0] === '-' || s[0] === '+') {
    neg = s[0] === '-';
    i = 1;
    if (s.length === 1) fail();
  }
  let v = 0n;
  const R = BigInt(radix);
  for (; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let d = -1;
    if (c >= 48 && c <= 57) d = c - 48;
    else if (c >= 97 && c <= 122) d = c - 87;
    else if (c >= 65 && c <= 90) d = c - 55;
    if (d < 0 || d >= radix) fail();
    v = v * R + BigInt(d);
  }
  if (neg) v = -v;
  const min = bits === 32 ? -2147483648n : -9223372036854775808n;
  const max = bits === 32 ? 2147483647n : 9223372036854775807n;
  if (v < min || v > max) fail();
  return v;
}

export function installLang(vm: JVM) {
  const consoleBuf: Record<number, number[]> = { 1: [], 2: [] };

  vm.registerNatives('java/lang/Object', {
    'getClass()Ljava/lang/Class;': (_t, [self]) => vm.classObject((self as JObject).cls),
    'hashCode()I': (_t, [self]) => vm.identityHash(self as JObject),
    'clone()Ljava/lang/Object;': (_t, [self]) => {
      const o = self as JObject;
      if (o instanceof JArray) return new JArray(o.cls, o.data.slice() as any);
      if (!vm.isAssignable(o.cls, vm.loadClass('java/lang/Cloneable'))) {
        vm.throwNew('java/lang/CloneNotSupportedException', o.cls.javaName);
      }
      return new JObject(o.cls, o.f.slice());
    },
    'notify()V': (t, [self]) => notify(vm, t, self as JObject, false),
    'notifyAll()V': (t, [self]) => notify(vm, t, self as JObject, true),
    'wait(J)V': (t, [self, timeout]) => {
      const o = self as JObject;
      const m = o.mon;
      if (!m || m.owner !== t) vm.throwNew('java/lang/IllegalMonitorStateException');
      const ms = Number(timeout as bigint);
      if (ms < 0) vm.throwNew('java/lang/IllegalArgumentException', 'timeout value is negative');
      t.waitCount = m.count;
      m.owner = null;
      m.count = 0;
      m.waiters.push(t);
      t.blockMon = m;
      t.notified = false;
      t.state = TState.Waiting;
      t.wakeAt = ms === 0 ? Infinity : performance.now() + ms;
      return BLOCK;
    },
  });

  vm.registerNatives('java/lang/Class', {
    'forName(Ljava/lang/String;)Ljava/lang/Class;': (t, [name]) => {
      const n = nullCheck(vm, vm.js(name)).replace(/\./g, '/');
      let cls: RtClass;
      try {
        cls = vm.loadClass(n);
      } catch {
        vm.throwNew('java/lang/ClassNotFoundException', vm.js(name));
      }
      if (!vm.ensureInit(t, cls)) return RETRY;
      return vm.classObject(cls);
    },
    'newInstance()Ljava/lang/Object;': (t, [self]) => {
      const cls = (self as JObject).peer as RtClass;
      if (cls.isArray || cls.isPrimitive || cls.isInterface || (cls.access & 0x0400) !== 0) {
        vm.throwNew('java/lang/InstantiationException', cls.javaName);
      }
      if (!vm.ensureInit(t, cls)) return RETRY;
      const ctor = cls.methods.get('<init>()V');
      if (!ctor) vm.throwNew('java/lang/InstantiationException', cls.javaName);
      const obj = vm.newObject(cls);
      vm.pushFrame(t, ctor, [obj], obj);
      return INVOKED;
    },
    'isInstance(Ljava/lang/Object;)Z': (_t, [self, o]) =>
      o != null && vm.isAssignable((o as JObject).cls, (self as JObject).peer as RtClass),
    'isAssignableFrom(Ljava/lang/Class;)Z': (_t, [self, other]) =>
      vm.isAssignable(nullCheck(vm, other as JObject | null).peer as RtClass, (self as JObject).peer as RtClass),
    'isInterface()Z': (_t, [self]) => ((self as JObject).peer as RtClass).isInterface,
    'isArray()Z': (_t, [self]) => ((self as JObject).peer as RtClass).isArray,
    'getName()Ljava/lang/String;': (_t, [self]) => vm.str(((self as JObject).peer as RtClass).javaName),
    'getResourceBytes(Ljava/lang/String;)[B': (_t, [self, name]) => {
      let n = nullCheck(vm, vm.js(name));
      if (n.startsWith('/')) n = n.slice(1);
      else {
        const cn = ((self as JObject).peer as RtClass).name;
        const slash = cn.lastIndexOf('/');
        if (slash >= 0) n = cn.slice(0, slash + 1) + n;
      }
      const data = vm.app.get(n);
      return data ? byteArray(vm, data) : null;
    },
  });

  const S = (o: JValue) => (o as JObject).peer as string;
  vm.registerNatives('java/lang/String', {
    'init(Ljava/lang/String;)V': (_t, [self, s]) => {
      (self as JObject).peer = S(nullCheck(vm, s));
    },
    'initChars([CII)V': (_t, [self, chars, off, count]) => {
      const a = nullCheck(vm, chars as JArray | null);
      checkRange(vm, a.data.length, off as number, count as number);
      (self as JObject).peer = charsToString(a.data as Uint16Array, off as number, count as number);
    },
    'initBytes([BIILjava/lang/String;)V': (_t, [self, bytes, off, len, enc]) => {
      const a = nullCheck(vm, bytes as JArray | null);
      checkRange(vm, a.data.length, off as number, len as number);
      const cs = normalizeCharset(vm.js(enc));
      if (!cs) vm.throwNew('java/io/UnsupportedEncodingException', vm.js(enc));
      const b = bytesOf(a).subarray(off as number, (off as number) + (len as number));
      (self as JObject).peer = decodeBytes(b, cs);
    },
    'length()I': (_t, [self]) => S(self).length,
    'charAt(I)C': (_t, [self, i]) => {
      const s = S(self);
      const idx = i as number;
      if (idx < 0 || idx >= s.length) vm.throwNew('java/lang/StringIndexOutOfBoundsException', String(idx));
      return s.charCodeAt(idx);
    },
    'getChars(II[CI)V': (_t, [self, begin, end, dst, dstBegin]) => {
      const s = S(self);
      const b = begin as number;
      const e = end as number;
      if (b < 0 || e > s.length || b > e) vm.throwNew('java/lang/StringIndexOutOfBoundsException', String(b));
      const d = nullCheck(vm, dst as JArray | null).data as Uint16Array;
      const db = dstBegin as number;
      if (db < 0 || db + (e - b) > d.length) vm.throwNew('java/lang/ArrayIndexOutOfBoundsException', String(db));
      for (let i = b; i < e; i++) d[db + i - b] = s.charCodeAt(i);
    },
    'getBytes(Ljava/lang/String;)[B': (_t, [self, enc]) => {
      const cs = normalizeCharset(vm.js(enc));
      if (!cs) vm.throwNew('java/io/UnsupportedEncodingException', vm.js(enc));
      return byteArray(vm, encodeString(S(self), cs));
    },
    'equals(Ljava/lang/Object;)Z': (_t, [self, o]) =>
      o != null && typeof (o as JObject).peer === 'string' && (o as JObject).peer === S(self),
    'equalsIgnoreCase(Ljava/lang/String;)Z': (_t, [self, o]) =>
      o != null && S(o).length === S(self).length && S(o).toLowerCase() === S(self).toLowerCase(),
    'compareTo(Ljava/lang/String;)I': (_t, [self, o]) => {
      const a = S(self);
      const b = S(nullCheck(vm, o));
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) {
        const d = a.charCodeAt(i) - b.charCodeAt(i);
        if (d !== 0) return d;
      }
      return a.length - b.length;
    },
    'regionMatches(ZILjava/lang/String;II)Z': (_t, [self, ic, toff, other, ooff, len]) => {
      const a = S(self);
      const b = S(nullCheck(vm, other));
      const to = toff as number;
      const oo = ooff as number;
      const n = len as number;
      if (to < 0 || oo < 0 || to + n > a.length || oo + n > b.length) return false;
      let x = a.substr(to, n);
      let y = b.substr(oo, n);
      if (ic) {
        x = x.toLowerCase();
        y = y.toLowerCase();
      }
      return x === y;
    },
    'startsWith(Ljava/lang/String;I)Z': (_t, [self, p, off]) => {
      const o = off as number;
      return o >= 0 && S(self).startsWith(S(nullCheck(vm, p)), o);
    },
    'endsWith(Ljava/lang/String;)Z': (_t, [self, p]) => S(self).endsWith(S(nullCheck(vm, p))),
    'hashCode()I': (_t, [self]) => {
      const o = self as JObject;
      if (o.hash === 0) o.hash = javaHash(o.peer);
      return o.hash;
    },
    'indexOf(II)I': (_t, [self, ch, from]) => S(self).indexOf(String.fromCharCode(ch as number), Math.max(0, from as number)),
    'lastIndexOf(II)I': (_t, [self, ch, from]) => {
      const f = from as number;
      return f < 0 ? -1 : S(self).lastIndexOf(String.fromCharCode(ch as number), f);
    },
    'indexOf(Ljava/lang/String;I)I': (_t, [self, str, from]) => {
      const s = S(self);
      const f = Math.max(0, from as number);
      const needle = S(nullCheck(vm, str));
      if (f > s.length) return needle.length === 0 ? s.length : -1;
      return s.indexOf(needle, f);
    },
    'lastIndexOf(Ljava/lang/String;I)I': (_t, [self, str, from]) => {
      const f = from as number;
      return f < 0 ? -1 : S(self).lastIndexOf(S(nullCheck(vm, str)), f);
    },
    'substring(II)Ljava/lang/String;': (_t, [self, b, e]) => {
      const s = S(self);
      const bi = b as number;
      const ei = e as number;
      if (bi < 0 || ei > s.length || bi > ei) {
        vm.throwNew('java/lang/StringIndexOutOfBoundsException', `begin ${bi}, end ${ei}, length ${s.length}`);
      }
      if (bi === 0 && ei === s.length) return self;
      return vm.str(s.slice(bi, ei));
    },
    'concat(Ljava/lang/String;)Ljava/lang/String;': (_t, [self, o]) => {
      const b = S(nullCheck(vm, o));
      return b.length === 0 ? self : vm.str(S(self) + b);
    },
    'replace(CC)Ljava/lang/String;': (_t, [self, a, b]) => {
      const s = S(self);
      const from = String.fromCharCode(a as number);
      if (!s.includes(from)) return self;
      return vm.str(s.split(from).join(String.fromCharCode(b as number)));
    },
    'toLowerCase()Ljava/lang/String;': (_t, [self]) => vm.str(S(self).toLowerCase()),
    'toUpperCase()Ljava/lang/String;': (_t, [self]) => vm.str(S(self).toUpperCase()),
    'trim()Ljava/lang/String;': (_t, [self]) => {
      const s = S(self);
      let b = 0;
      let e = s.length;
      while (b < e && s.charCodeAt(b) <= 32) b++;
      while (e > b && s.charCodeAt(e - 1) <= 32) e--;
      return b === 0 && e === s.length ? self : vm.str(s.slice(b, e));
    },
    'toCharArray()[C': (_t, [self]) => {
      const s = S(self);
      const arr = new Uint16Array(s.length);
      for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
      return vm.wrapArray('C', arr);
    },
    'intern()Ljava/lang/String;': (_t, [self]) => vm.intern(S(self)),
    'valueOf(C)Ljava/lang/String;': (_t, [c]) => vm.str(String.fromCharCode(c as number)),
  });

  vm.registerNatives('java/lang/System', {
    'currentTimeMillis()J': () => BigInt(Date.now()),
    'arraycopy(Ljava/lang/Object;ILjava/lang/Object;II)V': (_t, [src, sp, dst, dp, len]) =>
      arraycopy(vm, src as JObject | null, sp as number, dst as JObject | null, dp as number, len as number),
    'identityHashCode(Ljava/lang/Object;)I': (_t, [o]) => (o == null ? 0 : vm.identityHash(o as JObject)),
    'getProperty(Ljava/lang/String;)Ljava/lang/String;': (_t, [key]) => vm.strOrNull(systemProperty(vm.js(key))),
  });

  vm.registerNatives('java/lang/Runtime', {
    'exit(I)V': (_t, [code]) => {
      vm.halt(code as number);
      return BLOCK;
    },
  });

  vm.registerNatives('java/lang/Thread', {
    'currentThread()Ljava/lang/Thread;': (t) => currentThreadObject(vm, t),
    'yield()V': (t) => vm.sleep(t, 0),
    'sleep(J)V': (t, [ms]) => {
      const n = Number(ms as bigint);
      if (n < 0) vm.throwNew('java/lang/IllegalArgumentException', 'timeout value is negative');
      if (t.interrupted) {
        t.interrupted = false;
        vm.throwNew('java/lang/InterruptedException');
      }
      return vm.sleep(t, n);
    },
    'activeCount()I': () => vm.threads.length,
    'start0()V': (_t, [self]) => {
      const o = self as JObject;
      const run = vm.findVirtual(o.cls, 'run()V');
      const name = vm.js(vm.getField(o, 'name', 'Ljava/lang/String;')) ?? 'Thread';
      o.peer = vm.spawn(name, run, [o], o);
    },
    'interrupt()V': (_t, [self]) => {
      const target = (self as JObject).peer as JThread | undefined;
      if (!target) return;
      target.interrupted = true;
      if (target.state === TState.Sleeping) {
        target.interrupted = false;
        target.state = TState.Runnable;
        target.resumeThrow = vm.newThrowable('java/lang/InterruptedException', null, target);
        vm.kick();
      } else if (target.state === TState.Waiting) {
        vm.kick();
      }
    },
    'isAlive()Z': (_t, [self]) => {
      const target = (self as JObject).peer as JThread | undefined;
      return !!target && target.state !== TState.Terminated;
    },
  });

  vm.registerNatives('java/lang/Throwable', {
    'fillInStackTrace()V': (t, [self]) => {
      const o = self as JObject;
      // drop the constructor frames of the throwable itself
      let skip = 0;
      for (let i = t.frames.length - 1; i >= 0; i--) {
        const f = t.frames[i];
        if (f.m.name === '<init>' && vm.isAssignable(o.cls, f.m.cls)) skip++;
        else break;
      }
      o.peer = vm.captureStack(t).slice(skip);
    },
    'printStackTrace()V': (_t, [self]) => {
      const o = self as JObject;
      vm.out(vm.describeThrowable(o), 2);
      for (const line of (o.peer as string[] | undefined) ?? []) vm.out(`\tat ${line}`, 2);
    },
  });

  vm.registerNatives('java/lang/Math', {
    'max(FF)F': (_t, [a, b]) => Math.max(a as number, b as number),
    'max(DD)D': (_t, [a, b]) => Math.max(a as number, b as number),
    'min(FF)F': (_t, [a, b]) => Math.min(a as number, b as number),
    'min(DD)D': (_t, [a, b]) => Math.min(a as number, b as number),
    'sin(D)D': (_t, [a]) => Math.sin(a as number),
    'cos(D)D': (_t, [a]) => Math.cos(a as number),
    'tan(D)D': (_t, [a]) => Math.tan(a as number),
    'sqrt(D)D': (_t, [a]) => Math.sqrt(a as number),
    'ceil(D)D': (_t, [a]) => Math.ceil(a as number),
    'floor(D)D': (_t, [a]) => Math.floor(a as number),
    'random()D': () => Math.random(),
  });

  vm.registerNatives('java/lang/Integer', {
    'toString(II)Ljava/lang/String;': (_t, [i, radix]) => {
      const r = radix as number;
      return vm.str((i as number).toString(r < 2 || r > 36 ? 10 : r));
    },
    'toUnsignedString(II)Ljava/lang/String;': (_t, [i, shift]) => vm.str(((i as number) >>> 0).toString(1 << (shift as number))),
    'parseInt(Ljava/lang/String;I)I': (_t, [s, radix]) => Number(parseIntRadix(vm, vm.js(s), radix as number, 32)),
  });

  vm.registerNatives('java/lang/Long', {
    'toString(JI)Ljava/lang/String;': (_t, [l, radix]) => {
      const r = radix as number;
      return vm.str((l as bigint).toString(r < 2 || r > 36 ? 10 : r));
    },
    'parseLong(Ljava/lang/String;I)J': (_t, [s, radix]) => parseIntRadix(vm, vm.js(s), radix as number, 64),
  });

  vm.registerNatives('java/lang/Float', {
    'toString(F)Ljava/lang/String;': (_t, [f]) => vm.str(javaFloatToString(f as number)),
    'parseFloat(Ljava/lang/String;)F': (_t, [s]) => {
      const v = parseJavaDouble(nullCheck(vm, vm.js(s)));
      if (v === null) vm.throwNew('java/lang/NumberFormatException', vm.js(s));
      return Math.fround(v);
    },
    'floatToIntBits(F)I': (_t, [f]) => {
      if (Number.isNaN(f)) return 0x7fc00000;
      f32[0] = f as number;
      return i32[0];
    },
    'intBitsToFloat(I)F': (_t, [i]) => {
      i32[0] = i as number;
      return f32[0];
    },
  });

  vm.registerNatives('java/lang/Double', {
    'toString(D)Ljava/lang/String;': (_t, [d]) => vm.str(javaDoubleToString(d as number)),
    'parseDouble(Ljava/lang/String;)D': (_t, [s]) => {
      const v = parseJavaDouble(nullCheck(vm, vm.js(s)));
      if (v === null) vm.throwNew('java/lang/NumberFormatException', vm.js(s));
      return v;
    },
    'doubleToLongBits(D)J': (_t, [d]) => {
      if (Number.isNaN(d)) return 0x7ff8000000000000n;
      f64[0] = d as number;
      return i64[0];
    },
    'longBitsToDouble(J)D': (_t, [l]) => {
      i64[0] = l as bigint;
      return f64[0];
    },
  });

  vm.registerNatives('java/lang/Character', {
    'toLowerCase(C)C': (_t, [c]) => String.fromCharCode(c as number).toLowerCase().charCodeAt(0),
    'toUpperCase(C)C': (_t, [c]) => {
      const u = String.fromCharCode(c as number).toUpperCase();
      return u.length === 1 ? u.charCodeAt(0) : (c as number);
    },
  });

  vm.registerNatives('jargame/Text', {
    'decodeModifiedUtf8([B)Ljava/lang/String;': (_t, [b]) => vm.str(decodeModifiedUtf8(bytesOf(b as JArray))),
    'encodeModifiedUtf8(Ljava/lang/String;)[B': (_t, [s]) => byteArray(vm, encodeModifiedUtf8(S(s))),
    'encodeUtf8(Ljava/lang/String;)[B': (_t, [s]) => byteArray(vm, new TextEncoder().encode(S(s))),
  });

  vm.registerNatives('jargame/ConsoleStream', {
    'write0(I[BII)V': (_t, [fd, b, off, len]) => {
      const buf = consoleBuf[fd as number] ?? consoleBuf[1];
      const bytes = bytesOf(b as JArray).subarray(off as number, (off as number) + (len as number));
      for (const x of bytes) {
        if (x === 10) {
          vm.out(new TextDecoder().decode(Uint8Array.from(buf)), fd === 2 ? 2 : 1);
          buf.length = 0;
        } else buf.push(x);
      }
    },
  });
}

function notify(vm: JVM, t: JThread, o: JObject, all: boolean) {
  const m = o.mon;
  if (!m || m.owner !== t) vm.throwNew('java/lang/IllegalMonitorStateException');
  while (m.waiters.length > 0) {
    const w = m.waiters.shift()!;
    w.notified = true;
    if (!all) break;
  }
  vm.kick();
}

function currentThreadObject(vm: JVM, t: JThread): JObject {
  if (!t.javaThread) {
    const o = vm.newObjectByName('java/lang/Thread');
    vm.setField(o, 'name', 'Ljava/lang/String;', vm.str(t.name));
    vm.setField(o, 'priority', 'I', 5);
    vm.setField(o, 'started', 'Z', 1);
    o.peer = t;
    t.javaThread = o;
  }
  return t.javaThread;
}

function arraycopy(vm: JVM, src: JObject | null, sp: number, dst: JObject | null, dp: number, len: number) {
  if (src === null || dst === null) vm.throwNew('java/lang/NullPointerException', 'arraycopy');
  if (!(src instanceof JArray) || !(dst instanceof JArray)) vm.throwNew('java/lang/ArrayStoreException', 'not an array');
  const sc = src.cls.componentType!;
  const dc = dst.cls.componentType!;
  if (sc.isPrimitive !== dc.isPrimitive || (sc.isPrimitive && sc !== dc)) {
    vm.throwNew('java/lang/ArrayStoreException', `${src.cls.javaName} -> ${dst.cls.javaName}`);
  }
  if (len < 0 || sp < 0 || dp < 0 || sp + len > src.data.length || dp + len > dst.data.length) {
    vm.throwNew('java/lang/ArrayIndexOutOfBoundsException', `arraycopy: ${sp}+${len} / ${dp}+${len}`);
  }
  if (len === 0) return;
  if (sc.isPrimitive) {
    const s = src.data as Int32Array;
    const d = dst.data as Int32Array;
    if (s === d) d.copyWithin(dp, sp, sp + len);
    else d.set(s.subarray(sp, sp + len), dp);
    return;
  }
  const s = src.data as (JObject | null)[];
  const d = dst.data as (JObject | null)[];
  const checked = !vm.isAssignable(sc, dc);
  if (s === d && sp < dp) {
    for (let i = len - 1; i >= 0; i--) d[dp + i] = s[sp + i];
    return;
  }
  for (let i = 0; i < len; i++) {
    const v = s[sp + i];
    if (checked && v !== null && !vm.isAssignable(v.cls, dc)) vm.throwNew('java/lang/ArrayStoreException', v.cls.javaName);
    d[dp + i] = v;
  }
}

function systemProperty(key: string | null): string | null {
  switch (key) {
    case 'microedition.platform':
      return 'jargame';
    case 'microedition.encoding':
      return 'UTF-8';
    case 'microedition.configuration':
      return 'CLDC-1.1';
    case 'microedition.profiles':
      return 'MIDP-2.0';
    case 'microedition.locale':
      return 'zh-CN';
    default:
      return null;
  }
}
