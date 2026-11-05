export const enum CpTag {
  Utf8 = 1,
  Integer = 3,
  Float = 4,
  Long = 5,
  Double = 6,
  Class = 7,
  String = 8,
  Fieldref = 9,
  Methodref = 10,
  InterfaceMethodref = 11,
  NameAndType = 12,
  MethodHandle = 15,
  MethodType = 16,
  Dynamic = 17,
  InvokeDynamic = 18,
  Module = 19,
  Package = 20,
}

export type CpEntry =
  | { tag: CpTag.Utf8; value: string }
  | { tag: CpTag.Integer; value: number }
  | { tag: CpTag.Float; value: number }
  | { tag: CpTag.Long; value: bigint }
  | { tag: CpTag.Double; value: number }
  | { tag: CpTag.Class; nameIndex: number }
  | { tag: CpTag.String; stringIndex: number }
  | { tag: CpTag.Fieldref | CpTag.Methodref | CpTag.InterfaceMethodref; classIndex: number; natIndex: number }
  | { tag: CpTag.NameAndType; nameIndex: number; descIndex: number }
  | { tag: CpTag.MethodHandle | CpTag.MethodType | CpTag.Dynamic | CpTag.InvokeDynamic | CpTag.Module | CpTag.Package };

export interface ExceptionEntry {
  startPc: number;
  endPc: number;
  handlerPc: number;
  /** null = catch-all (finally) */
  catchType: string | null;
}

export interface CodeAttr {
  maxStack: number;
  maxLocals: number;
  code: Uint8Array;
  exceptionTable: ExceptionEntry[];
  /** pairs of [startPc, line] */
  lineNumbers: number[] | null;
}

export interface FieldInfo {
  access: number;
  name: string;
  desc: string;
  constantValue: number | bigint | string | null;
}

export interface MethodInfo {
  access: number;
  name: string;
  desc: string;
  code: CodeAttr | null;
}

export interface ClassFile {
  major: number;
  minor: number;
  cp: (CpEntry | undefined)[];
  access: number;
  name: string;
  superName: string | null;
  interfaces: string[];
  fields: FieldInfo[];
  methods: MethodInfo[];
  sourceFile: string | null;
}

export class ClassFormatError extends Error {}

/** Decodes the JVM "modified UTF-8" encoding into a JS (UTF-16) string. */
export function decodeModifiedUtf8(b: Uint8Array, start = 0, end = b.length): string {
  let out = '';
  let chunk: number[] = [];
  let i = start;
  while (i < end) {
    const c = b[i++];
    let ch: number;
    if (c < 0x80) {
      ch = c;
    } else if ((c & 0xe0) === 0xc0) {
      ch = ((c & 0x1f) << 6) | (b[i++] & 0x3f);
    } else if ((c & 0xf0) === 0xe0) {
      ch = ((c & 0x0f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f);
    } else {
      ch = 0xfffd;
    }
    chunk.push(ch);
    if (chunk.length >= 4096) {
      out += String.fromCharCode.apply(null, chunk);
      chunk = [];
    }
  }
  return out + String.fromCharCode.apply(null, chunk);
}

export function encodeModifiedUtf8(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 1 && c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return Uint8Array.from(out);
}

export function parseClassFile(bytes: Uint8Array): ClassFile {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const u1 = () => dv.getUint8(p++);
  const u2 = () => {
    const v = dv.getUint16(p);
    p += 2;
    return v;
  };
  const u4 = () => {
    const v = dv.getUint32(p);
    p += 4;
    return v;
  };

  if (bytes.length < 10 || u4() !== 0xcafebabe) throw new ClassFormatError('bad magic');
  const minor = u2();
  const major = u2();
  const cpCount = u2();
  const cp: (CpEntry | undefined)[] = new Array(cpCount);
  for (let i = 1; i < cpCount; i++) {
    const tag = u1() as CpTag;
    switch (tag) {
      case CpTag.Utf8: {
        const len = u2();
        cp[i] = { tag, value: decodeModifiedUtf8(bytes, p, p + len) };
        p += len;
        break;
      }
      case CpTag.Integer:
        cp[i] = { tag, value: dv.getInt32(p) };
        p += 4;
        break;
      case CpTag.Float:
        cp[i] = { tag, value: dv.getFloat32(p) };
        p += 4;
        break;
      case CpTag.Long:
        cp[i] = { tag, value: dv.getBigInt64(p) };
        p += 8;
        i++;
        break;
      case CpTag.Double:
        cp[i] = { tag, value: dv.getFloat64(p) };
        p += 8;
        i++;
        break;
      case CpTag.Class:
        cp[i] = { tag, nameIndex: u2() };
        break;
      case CpTag.String:
        cp[i] = { tag, stringIndex: u2() };
        break;
      case CpTag.Fieldref:
      case CpTag.Methodref:
      case CpTag.InterfaceMethodref:
        cp[i] = { tag, classIndex: u2(), natIndex: u2() };
        break;
      case CpTag.NameAndType:
        cp[i] = { tag, nameIndex: u2(), descIndex: u2() };
        break;
      case CpTag.MethodHandle:
        p += 3;
        cp[i] = { tag };
        break;
      case CpTag.MethodType:
      case CpTag.Module:
      case CpTag.Package:
        p += 2;
        cp[i] = { tag };
        break;
      case CpTag.Dynamic:
      case CpTag.InvokeDynamic:
        p += 4;
        cp[i] = { tag };
        break;
      default:
        throw new ClassFormatError(`bad constant pool tag ${tag} at #${i}`);
    }
  }

  const utf8 = (idx: number): string => {
    const e = cp[idx];
    if (!e || e.tag !== CpTag.Utf8) throw new ClassFormatError(`#${idx} is not Utf8`);
    return e.value;
  };
  const className = (idx: number): string => {
    const e = cp[idx];
    if (!e || e.tag !== CpTag.Class) throw new ClassFormatError(`#${idx} is not Class`);
    return utf8(e.nameIndex);
  };

  const access = u2();
  const name = className(u2());
  const superIdx = u2();
  const superName = superIdx === 0 ? null : className(superIdx);
  const interfaces: string[] = [];
  for (let n = u2(); n > 0; n--) interfaces.push(className(u2()));

  const fields: FieldInfo[] = [];
  for (let n = u2(); n > 0; n--) {
    const fAccess = u2();
    const fName = utf8(u2());
    const fDesc = utf8(u2());
    let constantValue: FieldInfo['constantValue'] = null;
    for (let a = u2(); a > 0; a--) {
      const aName = utf8(u2());
      const aLen = u4();
      if (aName === 'ConstantValue') {
        const e = cp[dv.getUint16(p)];
        if (e) {
          if (e.tag === CpTag.String) constantValue = utf8(e.stringIndex);
          else if ('value' in e) constantValue = e.value;
        }
      }
      p += aLen;
    }
    fields.push({ access: fAccess, name: fName, desc: fDesc, constantValue });
  }

  const methods: MethodInfo[] = [];
  for (let n = u2(); n > 0; n--) {
    const mAccess = u2();
    const mName = utf8(u2());
    const mDesc = utf8(u2());
    let code: CodeAttr | null = null;
    for (let a = u2(); a > 0; a--) {
      const aName = utf8(u2());
      const aLen = u4();
      const aEnd = p + aLen;
      if (aName === 'Code') {
        const maxStack = u2();
        const maxLocals = u2();
        const codeLen = u4();
        const codeBytes = bytes.subarray(p, p + codeLen);
        p += codeLen;
        const exceptionTable: ExceptionEntry[] = [];
        for (let e = u2(); e > 0; e--) {
          const startPc = u2();
          const endPc = u2();
          const handlerPc = u2();
          const ct = u2();
          exceptionTable.push({ startPc, endPc, handlerPc, catchType: ct === 0 ? null : className(ct) });
        }
        let lineNumbers: number[] | null = null;
        for (let ca = u2(); ca > 0; ca--) {
          const caName = utf8(u2());
          const caLen = u4();
          const caEnd = p + caLen;
          if (caName === 'LineNumberTable') {
            lineNumbers ??= [];
            for (let l = u2(); l > 0; l--) lineNumbers.push(u2(), u2());
          }
          p = caEnd;
        }
        code = { maxStack, maxLocals, code: codeBytes, exceptionTable, lineNumbers };
      }
      p = aEnd;
    }
    methods.push({ access: mAccess, name: mName, desc: mDesc, code });
  }

  let sourceFile: string | null = null;
  if (p + 2 <= bytes.length) {
    for (let a = u2(); a > 0; a--) {
      const aName = utf8(u2());
      const aLen = u4();
      if (aName === 'SourceFile' && aLen === 2) sourceFile = utf8(dv.getUint16(p));
      p += aLen;
    }
  }

  return { major, minor, cp, access, name, superName, interfaces, fields, methods, sourceFile };
}
