/** Charset helpers used by java.lang.String and friends. */

const utf8Strict = new TextDecoder('utf-8', { fatal: true });
const utf8Lenient = new TextDecoder('utf-8');
let gbkDecoder: TextDecoder | null = null;
let gbkEncodeTable: Map<number, number> | null = null;

function gbk(): TextDecoder {
  return (gbkDecoder ??= new TextDecoder('gbk'));
}

export type Charset = 'utf-8' | 'latin1' | 'gbk' | 'utf-16be' | 'utf-16le' | 'default';

export function normalizeCharset(name: string | null): Charset | null {
  if (name == null) return 'default';
  const n = name.toLowerCase().replace(/[_-]/g, '');
  if (n === 'utf8') return 'utf-8';
  if (n === 'iso88591' || n === 'latin1' || n === 'usascii' || n === 'ascii') return 'latin1';
  if (n === 'gbk' || n === 'gb2312' || n === 'gb18030' || n === 'cp936' || n === 'euccn') return 'gbk';
  if (n === 'utf16be' || n === 'unicodebig' || n === 'utf16' || n === 'unicodebigunmarked') return 'utf-16be';
  if (n === 'utf16le' || n === 'unicodelittle' || n === 'unicodelittleunmarked') return 'utf-16le';
  return null;
}

export function decodeBytes(bytes: Uint8Array, cs: Charset): string {
  switch (cs) {
    case 'utf-8':
      return utf8Lenient.decode(bytes);
    case 'latin1': {
      let s = '';
      for (let i = 0; i < bytes.length; i += 4096) {
        s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 4096)));
      }
      return s;
    }
    case 'gbk':
      return gbk().decode(bytes);
    case 'utf-16be':
      return new TextDecoder('utf-16be').decode(bytes);
    case 'utf-16le':
      return new TextDecoder('utf-16le').decode(bytes);
    case 'default':
      // phones in the target market defaulted to UTF-8 or GB2312; pick whichever decodes cleanly
      try {
        return utf8Strict.decode(bytes);
      } catch {
        return gbk().decode(bytes);
      }
  }
}

function gbkTable(): Map<number, number> {
  if (gbkEncodeTable) return gbkEncodeTable;
  const table = new Map<number, number>();
  const buf = new Uint8Array(2);
  const dec = gbk();
  for (let hi = 0x81; hi <= 0xfe; hi++) {
    for (let lo = 0x40; lo <= 0xfe; lo++) {
      if (lo === 0x7f) continue;
      buf[0] = hi;
      buf[1] = lo;
      const s = dec.decode(buf);
      if (s.length === 1 && s !== '\ufffd' && !table.has(s.charCodeAt(0))) table.set(s.charCodeAt(0), (hi << 8) | lo);
    }
  }
  return (gbkEncodeTable = table);
}

export function encodeString(s: string, cs: Charset): Uint8Array {
  switch (cs) {
    case 'utf-8':
    case 'default':
      return new TextEncoder().encode(s);
    case 'latin1': {
      const out = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        out[i] = c < 256 ? c : 0x3f;
      }
      return out;
    }
    case 'gbk': {
      const table = gbkTable();
      const out: number[] = [];
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else {
          const g = table.get(c);
          if (g === undefined) out.push(0x3f);
          else out.push(g >> 8, g & 0xff);
        }
      }
      return Uint8Array.from(out);
    }
    case 'utf-16be':
    case 'utf-16le': {
      const out = new Uint8Array(s.length * 2);
      const be = cs === 'utf-16be';
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        out[i * 2] = be ? c >> 8 : c & 0xff;
        out[i * 2 + 1] = be ? c & 0xff : c >> 8;
      }
      return out;
    }
  }
}

export function charsToString(chars: Uint16Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i += 4096) {
    s += String.fromCharCode.apply(null, Array.from(chars.subarray(off + i, off + Math.min(len, i + 4096))));
  }
  return s;
}

/** java.lang.String.hashCode */
export function javaHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function formatShortest(v: number, digitsSource: string): string {
  const [mant, expStr] = Number(digitsSource).toExponential().split('e');
  const exp = Number(expStr);
  const neg = mant.startsWith('-');
  const digits = mant.replace('-', '').replace('.', '');
  const abs = Math.abs(v);
  const sign = neg ? '-' : '';
  if (abs >= 1e-3 && abs < 1e7) {
    if (exp >= 0) {
      const intPart = digits.slice(0, exp + 1).padEnd(exp + 1, '0');
      const frac = digits.slice(exp + 1) || '0';
      return `${sign}${intPart}.${frac}`;
    }
    return `${sign}0.${'0'.repeat(-exp - 1)}${digits}`;
  }
  return `${sign}${digits[0]}.${digits.slice(1) || '0'}E${exp}`;
}

export function javaDoubleToString(v: number): string {
  if (Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return 'Infinity';
  if (v === -Infinity) return '-Infinity';
  if (v === 0) return 1 / v < 0 ? '-0.0' : '0.0';
  return formatShortest(v, String(v));
}

export function javaFloatToString(v: number): string {
  if (Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return 'Infinity';
  if (v === -Infinity) return '-Infinity';
  if (v === 0) return 1 / v < 0 ? '-0.0' : '0.0';
  let s = String(v);
  for (let p = 1; p <= 9; p++) {
    const c = v.toPrecision(p);
    if (Math.fround(Number(c)) === v) {
      s = c;
      break;
    }
  }
  return formatShortest(v, s);
}

const FLOAT_RE = /^[+-]?(NaN|Infinity|((\d+\.?\d*|\.\d+)([eE][+-]?\d+)?))[fFdD]?$/;

export function parseJavaDouble(s: string): number | null {
  const t = s.trim();
  if (!FLOAT_RE.test(t)) return null;
  return parseFloat(t.replace(/[fFdD]$/, ''));
}
