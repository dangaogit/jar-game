import type { ClassFile, CodeAttr, ExceptionEntry } from './classfile';

export const ACC_PUBLIC = 0x0001;
export const ACC_PRIVATE = 0x0002;
export const ACC_STATIC = 0x0008;
export const ACC_FINAL = 0x0010;
export const ACC_SYNCHRONIZED = 0x0020;
export const ACC_SUPER = 0x0020;
export const ACC_NATIVE = 0x0100;
export const ACC_INTERFACE = 0x0200;
export const ACC_ABSTRACT = 0x0400;

/**
 * Java value representation:
 *  - int/short/byte/char/boolean: JS number (int32 range)
 *  - float/double: JS number (float is kept rounded with Math.fround)
 *  - long: bigint (always normalised with BigInt.asIntN(64, ...))
 *  - reference: JObject | null
 * long/double occupy two slots on the operand stack and in locals; the value
 * lives in the first slot and the second one is an unused filler.
 */
export type JValue = number | bigint | JObject | null | undefined;

export class Monitor {
  owner: JThread | null = null;
  count = 0;
  waiters: JThread[] = [];
}

export class JObject {
  cls: RtClass;
  /** instance field slots */
  f: JValue[];
  mon: Monitor | null = null;
  /** host-side payload (JS string for java.lang.String, surfaces for Image, ...) */
  peer: any = undefined;
  hash = 0;
  constructor(cls: RtClass, f: JValue[]) {
    this.cls = cls;
    this.f = f;
  }
}

export type ArrayData =
  | Int8Array
  | Uint16Array
  | Int16Array
  | Int32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | (JObject | null)[];

export class JArray extends JObject {
  data: ArrayData;
  constructor(cls: RtClass, data: ArrayData) {
    super(cls, EMPTY_FIELDS);
    this.data = data;
  }
}

const EMPTY_FIELDS: JValue[] = [];

export class RtField {
  constructor(
    public cls: RtClass,
    public name: string,
    public desc: string,
    public access: number,
    public slot: number,
  ) {}
  get isStatic() {
    return (this.access & ACC_STATIC) !== 0;
  }
  get wide() {
    return this.desc === 'J' || this.desc === 'D';
  }
}

export type NativeFn = (t: JThread, args: JValue[]) => any;

export interface MethodSig {
  params: string[];
  ret: string;
  /** slots occupied by params (excluding `this`) */
  argSlots: number;
  wide: boolean[];
}

export class RtMethod {
  isStatic: boolean;
  isNative: boolean;
  isAbstract: boolean;
  isSync: boolean;
  sig: MethodSig;
  /** total slots including `this` */
  argSlots: number;
  native: NativeFn | null = null;
  code: Uint8Array | null;
  maxLocals: number;
  maxStack: number;
  exTable: ExceptionEntry[];
  lineNumbers: number[] | null;
  key: string;
  constructor(
    public cls: RtClass,
    public name: string,
    public desc: string,
    public access: number,
    codeAttr: CodeAttr | null,
  ) {
    this.isStatic = (access & ACC_STATIC) !== 0;
    this.isNative = (access & ACC_NATIVE) !== 0;
    this.isAbstract = (access & ACC_ABSTRACT) !== 0;
    this.isSync = (access & ACC_SYNCHRONIZED) !== 0;
    this.sig = parseMethodDesc(desc);
    this.argSlots = this.sig.argSlots + (this.isStatic ? 0 : 1);
    this.code = codeAttr?.code ?? null;
    this.maxLocals = Math.max(codeAttr?.maxLocals ?? 0, this.argSlots);
    this.maxStack = codeAttr?.maxStack ?? 0;
    this.exTable = codeAttr?.exceptionTable ?? [];
    this.lineNumbers = codeAttr?.lineNumbers ?? null;
    this.key = name + desc;
  }
  lineAt(pc: number): number {
    const ln = this.lineNumbers;
    if (!ln) return -1;
    let line = -1;
    for (let i = 0; i < ln.length; i += 2) if (ln[i] <= pc) line = ln[i + 1];
    return line;
  }
}

export const enum ClassState {
  Linked = 0,
  Initializing = 1,
  Initialized = 2,
  Error = 3,
}

export class RtClass {
  superClass: RtClass | null = null;
  interfaces: RtClass[] = [];
  access = 0;
  cf: ClassFile | null = null;
  /** declared fields, keyed by name:desc */
  fields = new Map<string, RtField>();
  /** declared methods, keyed by name+desc */
  methods = new Map<string, RtMethod>();
  instanceDefaults: JValue[] = [];
  statics: JValue[] = [];
  vcache = new Map<string, RtMethod | null>();
  state: ClassState = ClassState.Linked;
  initThread: JThread | null = null;
  /** resolved constant pool cache */
  cpCache: any[] = [];
  classObj: JObject | null = null;
  isArray = false;
  isPrimitive = false;
  componentType: RtClass | null = null;
  arrayClass: RtClass | null = null;
  constructor(public name: string) {}
  get isInterface() {
    return (this.access & ACC_INTERFACE) !== 0;
  }
  get javaName() {
    return this.name.replace(/\//g, '.');
  }
}

export class Frame {
  pc = 0;
  /** pc of the invoke instruction currently executing in a callee */
  invPc = 0;
  sp = 0;
  locals: JValue[];
  stack: JValue[];
  /** monitor object held because the method is synchronized */
  syncObj: JObject | null = null;
  /** value pushed to the caller instead of the method's own return (used by Class.newInstance) */
  retOverride: JValue | typeof NO_OVERRIDE = NO_OVERRIDE;
  onReturn: (() => void) | null = null;
  constructor(public m: RtMethod) {
    this.locals = new Array(m.maxLocals);
    this.stack = new Array(m.maxStack + 2);
  }
}

export const NO_OVERRIDE = Symbol('no-override');

export const enum TState {
  Runnable = 0,
  Sleeping = 1,
  BlockedMonitor = 2,
  Waiting = 3,
  BlockedNative = 4,
  BlockedInit = 5,
  Terminated = 6,
}

export class JThread {
  frames: Frame[] = [];
  state: TState = TState.Runnable;
  wakeAt = 0;
  blockMon: Monitor | null = null;
  blockInit: RtClass | null = null;
  waitCount = 0;
  notified = false;
  interrupted = false;
  /** value to push when resuming from an async native */
  resume: { kind: string; value: JValue } | null = null;
  resumeThrow: JObject | null = null;
  javaThread: JObject | null = null;
  constructor(
    public id: number,
    public name: string,
  ) {}
  get top(): Frame | undefined {
    return this.frames[this.frames.length - 1];
  }
}

/** JS exception carrying a Java Throwable through the host stack. */
export class JavaThrow extends Error {
  constructor(public obj: JObject) {
    super('JavaThrow');
  }
}

/** Thrown when the VM itself is broken/unimplemented (as opposed to a Java-level exception). */
export class VMError extends Error {}

export function parseMethodDesc(desc: string): MethodSig {
  const params: string[] = [];
  let i = 1;
  while (desc[i] !== ')') {
    const start = i;
    while (desc[i] === '[') i++;
    if (desc[i] === 'L') i = desc.indexOf(';', i) + 1;
    else i++;
    params.push(desc.slice(start, i));
  }
  const ret = desc.slice(i + 1);
  const wide = params.map((p) => p === 'J' || p === 'D');
  const argSlots = params.length + wide.filter(Boolean).length;
  return { params, ret, argSlots, wide };
}

export function defaultValue(desc: string): JValue {
  switch (desc[0]) {
    case 'J':
      return 0n;
    case 'L':
    case '[':
      return null;
    default:
      return 0;
  }
}
