import { parseClassFile } from './classfile';
import { execute } from './interp';
import {
  ACC_PUBLIC,
  ACC_STATIC,
  ClassState,
  Frame,
  JArray,
  JavaThrow,
  JObject,
  JThread,
  RtClass,
  RtField,
  RtMethod,
  TState,
  VMError,
  defaultValue,
  type ArrayData,
  type JValue,
  type NativeFn,
} from './runtime';

/** Returned by a native to signal the thread blocked; resumed via `vm.resumeWith`. */
export const BLOCK = Symbol('block');
/** Returned by a native that pushed frames and wants the invoke instruction re-executed afterwards. */
export const RETRY = Symbol('retry');
/** Returned by a native that pushed a callee frame whose return value is the native's result. */
export const INVOKED = Symbol('invoked');

export interface VMOptions {
  /** platform class library (rt.jar) entries */
  boot: Map<string, Uint8Array>;
  /** application jar entries (classes + resources) */
  app: Map<string, Uint8Array>;
  out?: (text: string, stream: 1 | 2) => void;
  /** max milliseconds of interpretation per scheduler tick */
  sliceMs?: number;
}

export type NativeInstaller = (vm: JVM) => void;

export class JVM {
  readonly boot: Map<string, Uint8Array>;
  readonly app: Map<string, Uint8Array>;
  readonly natives = new Map<string, NativeFn>();
  readonly classes = new Map<string, RtClass>();
  readonly threads: JThread[] = [];
  readonly interned = new Map<string, JObject>();
  out: (text: string, stream: 1 | 2) => void;
  sliceMs: number;
  /** bytecodes a thread runs before the scheduler moves on to the next one */
  quantum = 20000;
  /** total bytecodes executed */
  icount = 0;
  halted = false;
  exitCode = 0;
  private scheduled = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private channel: MessageChannel | null = null;
  private exitWaiters: ((code: number) => void)[] = [];
  hashSeed = 0x1234567;
  nextThreadId = 1;
  /** partial output lines of System.out (1) / System.err (2), as bytes */
  readonly consoleBuf: Record<number, number[]> = { 1: [], 2: [] };
  onUncaught: ((t: JThread, ex: JObject) => void) | null = null;
  /** runs at the start of every scheduler tick, while no Java code is executing */
  onTick: (() => void) | null = null;

  constructor(opts: VMOptions) {
    this.boot = opts.boot;
    this.app = opts.app;
    this.out = opts.out ?? ((s, stream) => (stream === 2 ? console.error(s) : console.log(s)));
    this.sliceMs = opts.sliceMs ?? 12;
  }

  install(...installers: NativeInstaller[]) {
    for (const i of installers) i(this);
    return this;
  }

  registerNatives(className: string, fns: Record<string, NativeFn>) {
    for (const [k, fn] of Object.entries(fns)) this.natives.set(`${className}.${k}`, fn);
  }

  // ---------------------------------------------------------------------------
  // class loading
  // ---------------------------------------------------------------------------

  loadClass(name: string): RtClass {
    const existing = this.classes.get(name);
    if (existing) return existing;
    if (name[0] === '[') return this.arrayClass(name.slice(1));
    const bytes = this.boot.get(name + '.class') ?? this.app.get(name + '.class');
    if (!bytes) this.throwNew('java/lang/NoClassDefFoundError', name.replace(/\//g, '.'));
    const cf = parseClassFile(bytes);
    if (cf.name !== name) this.throwNew('java/lang/NoClassDefFoundError', `${name} (wrong name: ${cf.name})`);
    const cls = new RtClass(name);
    cls.cf = cf;
    cls.access = cf.access;
    this.classes.set(name, cls);
    try {
      this.link(cls);
    } catch (e) {
      this.classes.delete(name);
      throw e;
    }
    return cls;
  }

  hasClass(name: string) {
    return this.classes.has(name) || this.boot.has(name + '.class') || this.app.has(name + '.class');
  }

  private link(cls: RtClass) {
    const cf = cls.cf!;
    if (cf.superName) {
      cls.superClass = this.loadClass(cf.superName);
      cls.instanceDefaults = cls.superClass.instanceDefaults.slice();
    }
    cls.interfaces = cf.interfaces.map((n) => this.loadClass(n));
    let staticSlot = 0;
    for (const fi of cf.fields) {
      const isStatic = (fi.access & ACC_STATIC) !== 0;
      const slot = isStatic ? staticSlot++ : cls.instanceDefaults.length;
      const f = new RtField(cls, fi.name, fi.desc, fi.access, slot);
      cls.fields.set(fi.name + ':' + fi.desc, f);
      if (isStatic) {
        let v = defaultValue(fi.desc);
        if (fi.constantValue !== null) {
          const cv = fi.constantValue;
          v = typeof cv === 'string' ? this.intern(cv) : fi.desc === 'F' ? Math.fround(cv as number) : cv;
        }
        cls.statics[slot] = v;
      } else {
        cls.instanceDefaults.push(defaultValue(fi.desc));
      }
    }
    for (const mi of cf.methods) {
      const m = new RtMethod(cls, mi.name, mi.desc, mi.access, mi.code);
      if (m.isNative) m.native = this.natives.get(`${cls.name}.${m.key}`) ?? null;
      cls.methods.set(m.key, m);
    }
    cls.cpCache = new Array(cf.cp.length);
  }

  arrayClass(componentDesc: string): RtClass {
    const name = '[' + componentDesc;
    const existing = this.classes.get(name);
    if (existing) return existing;
    const cls = new RtClass(name);
    cls.isArray = true;
    cls.access = ACC_PUBLIC;
    cls.superClass = this.loadClass('java/lang/Object');
    cls.interfaces = this.hasClass('java/lang/Cloneable') ? [this.loadClass('java/lang/Cloneable')] : [];
    cls.componentType = this.classForDesc(componentDesc);
    cls.state = ClassState.Initialized;
    this.classes.set(name, cls);
    return cls;
  }

  private primitives = new Map<string, RtClass>();

  classForDesc(desc: string): RtClass {
    switch (desc[0]) {
      case 'L':
        return this.loadClass(desc.slice(1, -1));
      case '[':
        return this.arrayClass(desc.slice(1));
      default: {
        let p = this.primitives.get(desc);
        if (!p) {
          p = new RtClass(desc);
          p.isPrimitive = true;
          p.state = ClassState.Initialized;
          this.primitives.set(desc, p);
        }
        return p;
      }
    }
  }

  isAssignable(s: RtClass, t: RtClass): boolean {
    if (s === t) return true;
    if (t.isPrimitive || s.isPrimitive) return false;
    if (t.name === 'java/lang/Object') return true;
    if (s.isArray) {
      if (t.isArray) {
        const sc = s.componentType!;
        const tc = t.componentType!;
        if (sc.isPrimitive || tc.isPrimitive) return sc === tc;
        return this.isAssignable(sc, tc);
      }
      return t.isInterface && s.interfaces.includes(t);
    }
    if (t.isInterface) return this.implementsInterface(s, t);
    for (let c = s.superClass; c; c = c.superClass) if (c === t) return true;
    return false;
  }

  private implementsInterface(s: RtClass, t: RtClass): boolean {
    for (let c: RtClass | null = s; c; c = c.superClass) {
      for (const i of c.interfaces) if (i === t || this.implementsInterface(i, t)) return true;
    }
    return false;
  }

  instanceOf(o: JObject, cls: RtClass) {
    return this.isAssignable(o.cls, cls);
  }

  resolveField(cls: RtClass, name: string, desc: string): RtField {
    const key = name + ':' + desc;
    const find = (c: RtClass): RtField | undefined => {
      const f = c.fields.get(key);
      if (f) return f;
      for (const i of c.interfaces) {
        const r = find(i);
        if (r) return r;
      }
      return c.superClass ? find(c.superClass) : undefined;
    };
    const f = find(cls);
    if (!f) this.throwNew('java/lang/NoSuchFieldError', `${cls.javaName}.${name}`);
    return f;
  }

  resolveMethod(cls: RtClass, name: string, desc: string): RtMethod {
    const key = name + desc;
    for (let c: RtClass | null = cls; c; c = c.superClass) {
      const m = c.methods.get(key);
      if (m) return m;
    }
    const fromIfaces = (c: RtClass): RtMethod | undefined => {
      for (const i of c.interfaces) {
        const m = i.methods.get(key) ?? fromIfaces(i);
        if (m) return m;
      }
      return c.superClass ? fromIfaces(c.superClass) : undefined;
    };
    const m = fromIfaces(cls);
    if (!m) this.throwNew('java/lang/NoSuchMethodError', `${cls.javaName}.${name}${desc}`);
    return m;
  }

  /** virtual dispatch on the runtime class */
  findVirtual(cls: RtClass, key: string): RtMethod {
    let m = cls.vcache.get(key);
    if (m === undefined) {
      m = null;
      for (let c: RtClass | null = cls; c; c = c.superClass) {
        const cand = c.methods.get(key);
        if (cand && !cand.isStatic) {
          m = cand;
          break;
        }
      }
      cls.vcache.set(key, m);
    }
    if (!m || m.isAbstract) this.throwNew('java/lang/AbstractMethodError', `${cls.javaName}.${key}`);
    return m;
  }

  /**
   * Makes sure `cls` is initialized. Returns true when the caller may proceed;
   * false when frames were pushed / the thread blocked and the current
   * instruction must be re-executed later.
   */
  ensureInit(t: JThread, cls: RtClass): boolean {
    if (cls.state === ClassState.Initialized) return true;
    if (cls.state === ClassState.Error) this.throwNew('java/lang/NoClassDefFoundError', cls.javaName);
    if (cls.state === ClassState.Initializing) {
      if (cls.initThread === t) return true;
      t.state = TState.BlockedInit;
      t.blockInit = cls;
      return false;
    }
    // collect cls and uninitialized superclasses; supers run first (pushed last)
    const chain: RtClass[] = [];
    for (let c: RtClass | null = cls; c && c.state === ClassState.Linked; c = c.isInterface ? null : c.superClass) {
      chain.push(c);
    }
    let pushed = false;
    for (const c of chain) {
      c.state = ClassState.Initializing;
      c.initThread = t;
      const clinit = c.methods.get('<clinit>()V');
      if (clinit) {
        const f = new Frame(clinit);
        f.onReturn = clinitDone(c);
        t.frames.push(f);
        pushed = true;
      } else {
        c.state = ClassState.Initialized;
        c.initThread = null;
      }
    }
    return !pushed;
  }

  // ---------------------------------------------------------------------------
  // objects
  // ---------------------------------------------------------------------------

  newObject(cls: RtClass): JObject {
    return new JObject(cls, cls.instanceDefaults.slice());
  }

  newObjectByName(name: string): JObject {
    return this.newObject(this.loadClass(name));
  }

  newArray(componentDesc: string, length: number): JArray {
    if (length < 0) this.throwNew('java/lang/NegativeArraySizeException', String(length));
    let data: ArrayData;
    switch (componentDesc) {
      case 'Z':
      case 'B':
        data = new Int8Array(length);
        break;
      case 'C':
        data = new Uint16Array(length);
        break;
      case 'S':
        data = new Int16Array(length);
        break;
      case 'I':
        data = new Int32Array(length);
        break;
      case 'F':
        data = new Float32Array(length);
        break;
      case 'D':
        data = new Float64Array(length);
        break;
      case 'J':
        data = new BigInt64Array(length);
        break;
      default:
        data = new Array(length).fill(null);
    }
    return new JArray(this.arrayClass(componentDesc), data);
  }

  wrapArray(componentDesc: string, data: ArrayData): JArray {
    return new JArray(this.arrayClass(componentDesc), data);
  }

  newMultiArray(desc: string, dims: number[]): JArray {
    const comp = desc.slice(1);
    const arr = this.newArray(comp, dims[0]);
    if (dims.length > 1) {
      const d = arr.data as (JObject | null)[];
      for (let i = 0; i < dims[0]; i++) d[i] = this.newMultiArray(comp, dims.slice(1));
    }
    return arr;
  }

  identityHash(o: JObject): number {
    if (o.hash === 0) {
      this.hashSeed = (Math.imul(this.hashSeed, 1103515245) + 12345) | 0;
      o.hash = (this.hashSeed >>> 1) | 1;
    }
    return o.hash;
  }

  private stringClass: RtClass | null = null;

  str(s: string): JObject {
    const cls = (this.stringClass ??= this.loadClass('java/lang/String'));
    const o = new JObject(cls, []);
    o.peer = s;
    return o;
  }

  strOrNull(s: string | null | undefined): JObject | null {
    return s == null ? null : this.str(s);
  }

  intern(s: string): JObject {
    let o = this.interned.get(s);
    if (!o) {
      o = this.str(s);
      this.interned.set(s, o);
    }
    return o;
  }

  /** JS string of a java.lang.String (null-safe) */
  js(o: JValue): string | null {
    if (o == null) return null;
    return (o as JObject).peer as string;
  }

  classObject(cls: RtClass): JObject {
    if (!cls.classObj) {
      const o = this.newObjectByName('java/lang/Class');
      o.peer = cls;
      cls.classObj = o;
    }
    return cls.classObj;
  }

  fieldSlot(cls: RtClass, name: string, desc: string): number {
    return this.resolveField(cls, name, desc).slot;
  }

  getField(o: JObject, name: string, desc: string): JValue {
    return o.f[this.fieldSlot(o.cls, name, desc)];
  }

  setField(o: JObject, name: string, desc: string, v: JValue) {
    o.f[this.fieldSlot(o.cls, name, desc)] = v;
  }

  // ---------------------------------------------------------------------------
  // exceptions
  // ---------------------------------------------------------------------------

  newThrowable(className: string, message?: string | null, t?: JThread): JObject {
    const cls = this.loadClass(className);
    const o = this.newObject(cls);
    if (message != null) this.setField(o, 'detailMessage', 'Ljava/lang/String;', this.str(message));
    o.peer = t ? this.captureStack(t) : [];
    return o;
  }

  throwNew(className: string, message?: string | null): never {
    throw new JavaThrow(this.newThrowable(className, message, this.current ?? undefined));
  }

  captureStack(t: JThread): string[] {
    const out: string[] = [];
    for (let i = t.frames.length - 1; i >= 0; i--) {
      const f = t.frames[i];
      const m = f.m;
      const pc = i === t.frames.length - 1 ? f.pc : f.invPc;
      const line = m.lineAt(pc);
      const src = m.cls.cf?.sourceFile ?? 'Unknown Source';
      out.push(`${m.cls.javaName}.${m.name}(${line >= 0 ? `${src}:${line}` : `${src}@pc${pc}`})`);
    }
    return out;
  }

  describeThrowable(ex: JObject): string {
    const msg = this.js(this.getField(ex, 'detailMessage', 'Ljava/lang/String;'));
    return msg != null ? `${ex.cls.javaName}: ${msg}` : ex.cls.javaName;
  }

  // ---------------------------------------------------------------------------
  // threads & scheduling
  // ---------------------------------------------------------------------------

  /** thread currently being interpreted */
  current: JThread | null = null;

  spawn(name: string, m: RtMethod, args: JValue[], javaThread: JObject | null = null): JThread {
    const t = new JThread(this.nextThreadId++, name);
    t.javaThread = javaThread;
    const f = new Frame(m);
    let slot = 0;
    let ai = 0;
    if (!m.isStatic) f.locals[slot++] = args[ai++];
    for (const w of m.sig.wide) {
      f.locals[slot] = args[ai++];
      slot += w ? 2 : 1;
    }
    t.frames.push(f);
    this.threads.push(t);
    this.kick();
    return t;
  }

  /** Push a callee frame onto `t` (used by natives returning INVOKED). */
  pushFrame(t: JThread, m: RtMethod, args: JValue[], retOverride?: JValue): Frame {
    const f = new Frame(m);
    let slot = 0;
    let ai = 0;
    if (!m.isStatic) f.locals[slot++] = args[ai++];
    for (const w of m.sig.wide) {
      f.locals[slot] = args[ai++];
      slot += w ? 2 : 1;
    }
    if (arguments.length >= 4) f.retOverride = retOverride;
    t.frames.push(f);
    return f;
  }

  /** Blocks `t` until `p` settles; its value becomes the native method's return value. */
  blockOn(t: JThread, kind: string, p: Promise<JValue>): typeof BLOCK {
    t.state = TState.BlockedNative;
    p.then(
      (value) => {
        if (t.state !== TState.BlockedNative) return;
        t.resume = { kind, value };
        t.state = TState.Runnable;
        this.kick();
      },
      (err) => {
        if (t.state !== TState.BlockedNative) return;
        t.resumeThrow =
          err instanceof JavaThrow ? err.obj : this.newThrowable('java/lang/Error', String(err?.message ?? err));
        t.state = TState.Runnable;
        this.kick();
      },
    );
    return BLOCK;
  }

  sleep(t: JThread, ms: number): typeof BLOCK {
    t.state = TState.Sleeping;
    t.wakeAt = performance.now() + Math.max(0, ms);
    return BLOCK;
  }

  private isRunnable(t: JThread, now: number): boolean {
    switch (t.state) {
      case TState.Runnable:
        return true;
      case TState.Sleeping:
        if (now >= t.wakeAt) {
          t.state = TState.Runnable;
          return true;
        }
        return false;
      case TState.BlockedMonitor:
        if (!t.blockMon!.owner) {
          t.state = TState.Runnable;
          t.blockMon = null;
          return true;
        }
        return false;
      case TState.Waiting: {
        const m = t.blockMon!;
        if ((t.notified || t.interrupted || now >= t.wakeAt) && !m.owner) {
          const i = m.waiters.indexOf(t);
          if (i >= 0) m.waiters.splice(i, 1);
          m.owner = t;
          m.count = t.waitCount;
          t.notified = false;
          t.blockMon = null;
          t.state = TState.Runnable;
          if (t.interrupted) {
            t.interrupted = false;
            t.resumeThrow = this.newThrowable('java/lang/InterruptedException', null, t);
          }
          return true;
        }
        return false;
      }
      case TState.BlockedInit:
        if (t.blockInit!.state !== ClassState.Initializing) {
          t.state = TState.Runnable;
          t.blockInit = null;
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  kick() {
    if (this.halted || this.scheduled) return;
    this.scheduled = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (typeof MessageChannel !== 'undefined' && typeof window !== 'undefined') {
      if (!this.channel) {
        this.channel = new MessageChannel();
        this.channel.port1.onmessage = () => this.tick();
      }
      this.channel.port2.postMessage(0);
    } else {
      setTimeout(() => this.tick(), 0);
    }
  }

  private tick() {
    this.scheduled = false;
    if (this.halted) return;
    if (this.onTick) {
      try {
        this.onTick();
      } catch (e) {
        this.out(`[onTick] ${(e as Error)?.message ?? e}`, 2);
      }
    }
    const start = performance.now();
    let now = start;
    for (;;) {
      let ran = false;
      for (let i = 0; i < this.threads.length; i++) {
        const t = this.threads[i];
        if (!this.isRunnable(t, now)) continue;
        ran = true;
        this.current = t;
        try {
          execute(this, t, this.quantum);
        } catch (e) {
          this.current = null;
          this.fatal(e);
          return;
        }
        this.current = null;
        if (this.halted) return;
        if (t.state === TState.Terminated) {
          this.threads.splice(i, 1);
          i--;
        }
      }
      now = performance.now();
      if (!ran || now - start >= this.sliceMs) break;
    }
    if (this.threads.length === 0) {
      this.halt(0);
      return;
    }
    let anyRunnable = false;
    let nextWake = Infinity;
    for (const t of this.threads) {
      if (t.state === TState.Runnable) anyRunnable = true;
      else if (t.state === TState.Sleeping || t.state === TState.Waiting) nextWake = Math.min(nextWake, t.wakeAt);
      else if (t.state === TState.BlockedMonitor || t.state === TState.BlockedInit) anyRunnable = true;
    }
    if (anyRunnable) this.kick();
    else if (nextWake !== Infinity) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.kick();
      }, Math.max(0, nextWake - performance.now()));
    }
  }

  threadDied(t: JThread, ex: JObject | null) {
    t.state = TState.Terminated;
    t.frames.length = 0;
    if (ex) {
      if (this.onUncaught) this.onUncaught(t, ex);
      this.out(`Exception in thread "${t.name}" ${this.describeThrowable(ex)}`, 2);
      for (const line of (ex.peer as string[] | undefined) ?? []) this.out(`\tat ${line}`, 2);
    }
  }

  fatal(e: unknown) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
    this.out(`[VM fatal] ${msg}`, 2);
    this.halt(1);
  }

  halt(code: number) {
    if (this.halted) return;
    this.halted = true;
    this.exitCode = code;
    if (this.timer) clearTimeout(this.timer);
    this.channel?.port1.close();
    for (const w of this.exitWaiters) w(code);
    this.exitWaiters = [];
  }

  waitForExit(): Promise<number> {
    if (this.halted) return Promise.resolve(this.exitCode);
    return new Promise((r) => this.exitWaiters.push(r));
  }

  /** Runs `className.main(String[])` (or another static method) in a new thread. */
  runMain(className: string, args: string[] = [], methodKey = 'main([Ljava/lang/String;)V'): JThread {
    const cls = this.loadClass(className);
    const m = cls.methods.get(methodKey);
    if (!m || !m.isStatic) throw new VMError(`${className}.${methodKey} not found`);
    const arr = this.newArray('Ljava/lang/String;', args.length);
    args.forEach((a, i) => ((arr.data as JObject[])[i] = this.str(a)));
    const t = this.spawn('main', m, methodKey.startsWith('main([') ? [arr] : []);
    this.ensureInit(t, cls);
    return t;
  }
}

/** `Frame.onReturn` of a `<clinit>` frame */
export function clinitDone(c: RtClass): () => void {
  return () => {
    c.state = ClassState.Initialized;
    c.initThread = null;
  };
}
