// Scans jars for references to platform APIs and reports the ones missing from public/rt.jar.
// usage: node scripts/api-usage.mjs <jar dir> [--prefix com/nokia/] [--all]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';

const args = process.argv.slice(2);
const dir = args[0];
const prefixIdx = args.indexOf('--prefix');
const prefix = prefixIdx >= 0 ? args[prefixIdx + 1] : null;
const showAll = args.includes('--all');

function parseRefs(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 10 || dv.getUint32(0) !== 0xcafebabe) return null;
  let p = 8;
  const n = dv.getUint16(p);
  p += 2;
  const cp = new Array(n);
  for (let i = 1; i < n; i++) {
    const tag = b[p++];
    switch (tag) {
      case 1: {
        const len = dv.getUint16(p);
        cp[i] = { tag, s: new TextDecoder().decode(b.subarray(p + 2, p + 2 + len)) };
        p += 2 + len;
        break;
      }
      case 3:
      case 4:
        p += 4;
        break;
      case 5:
      case 6:
        p += 8;
        i++;
        break;
      case 7:
      case 8:
      case 16:
      case 19:
      case 20:
        cp[i] = { tag, a: dv.getUint16(p) };
        p += 2;
        break;
      case 9:
      case 10:
      case 11:
      case 12:
      case 17:
      case 18:
        cp[i] = { tag, a: dv.getUint16(p), b: dv.getUint16(p + 2) };
        p += 4;
        break;
      case 15:
        p += 3;
        break;
      default:
        return null;
    }
  }
  const utf = (i) => cp[i]?.s;
  const cls = (i) => utf(cp[i]?.a);
  const access = dv.getUint16(p);
  const self = cls(dv.getUint16(p + 2));
  const superIdx = dv.getUint16(p + 4);
  const refs = {
    self,
    super: superIdx ? cls(superIdx) : null,
    interfaces: [],
    classes: new Set(),
    members: new Set(),
    declared: new Set(),
  };
  let q = p + 6;
  const ni = dv.getUint16(q);
  for (let k = 0; k < ni; k++) refs.interfaces.push(cls(dv.getUint16(q + 2 + k * 2)));
  q += 2 + ni * 2;
  for (const kind of ['field', 'method']) {
    const count = dv.getUint16(q);
    q += 2;
    for (let k = 0; k < count; k++) {
      const nm = utf(dv.getUint16(q + 2));
      const ds = utf(dv.getUint16(q + 4));
      refs.declared.add(kind === 'field' ? `${nm}:${ds}` : `${nm}${ds}`);
      let ac = dv.getUint16(q + 6);
      q += 8;
      while (ac-- > 0) q += 6 + dv.getUint32(q + 2);
    }
  }
  for (let i = 1; i < n; i++) {
    const e = cp[i];
    if (!e) continue;
    if (e.tag === 7) refs.classes.add(utf(e.a));
    else if (e.tag >= 9 && e.tag <= 11) {
      const nat = cp[e.b];
      refs.members.add(`${cls(e.a)}.${utf(nat.a)}${e.tag === 9 ? ':' : ''}${utf(nat.b)}`);
    }
  }
  void access;
  return refs;
}

// ---- platform model from rt.jar
const rt = unzipSync(readFileSync(new URL('../public/rt.jar', import.meta.url)));
const rtClasses = new Map();
for (const [name, data] of Object.entries(rt)) {
  if (!name.endsWith('.class')) continue;
  const b = data;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // re-parse fully for members
  let p = 8;
  const n = dv.getUint16(p);
  p += 2;
  const cp = new Array(n);
  for (let i = 1; i < n; i++) {
    const tag = b[p++];
    if (tag === 1) {
      const len = dv.getUint16(p);
      cp[i] = new TextDecoder().decode(b.subarray(p + 2, p + 2 + len));
      p += 2 + len;
    } else if (tag === 5 || tag === 6) {
      p += 8;
      i++;
    } else if (tag === 7 || tag === 8 || tag === 16) {
      cp[i] = { a: dv.getUint16(p) };
      p += 2;
    } else if (tag === 15) p += 3;
    else p += 4;
  }
  const cname = (i) => cp[cp[i].a];
  p += 2;
  const self = cname(dv.getUint16(p));
  const sup = dv.getUint16(p + 2);
  const info = { super: sup ? cname(sup) : null, interfaces: [], members: new Set() };
  p += 4;
  const ni = dv.getUint16(p);
  p += 2;
  for (let k = 0; k < ni; k++, p += 2) info.interfaces.push(cname(dv.getUint16(p)));
  for (const kind of ['field', 'method']) {
    const count = dv.getUint16(p);
    p += 2;
    for (let k = 0; k < count; k++) {
      const nm = cp[dv.getUint16(p + 2)];
      const ds = cp[dv.getUint16(p + 4)];
      info.members.add(kind === 'field' ? `${nm}:${ds}` : `${nm}${ds}`);
      let ac = dv.getUint16(p + 6);
      p += 8;
      while (ac-- > 0) p += 6 + dv.getUint32(p + 2);
    }
  }
  rtClasses.set(self, info);
}

function rtHas(cls, member) {
  const seen = new Set();
  const stack = [cls];
  while (stack.length) {
    const c = stack.pop();
    if (!c || seen.has(c)) continue;
    seen.add(c);
    const info = rtClasses.get(c);
    if (!info) continue;
    if (info.members.has(member)) return true;
    stack.push(info.super, ...info.interfaces);
  }
  return false;
}

const isPlatform = (c) => !!c && /^(java|javax|com\/nokia|com\/siemens|com\/samsung|com\/motorola|com\/sonyericsson|com\/mascotcapsule|com\/vodafone|mmpp|com\/jblend)\//.test(c);

const missingClass = new Map();
const missingMember = new Map();
const used = new Map();
const jars = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.jar'));
for (const jar of jars) {
  let entries;
  try {
    entries = unzipSync(readFileSync(join(dir, jar)));
  } catch {
    continue;
  }
  const appClasses = new Map();
  for (const [name, data] of Object.entries(entries)) {
    if (!name.endsWith('.class')) continue;
    const r = parseRefs(data);
    if (r) appClasses.set(r.self, r);
  }
  const jarMissingClass = new Set();
  const jarMissingMember = new Set();
  const jarUsed = new Set();
  // walks the app class hierarchy; returns null when the member is declared by the app itself,
  // otherwise the first platform superclass that must provide it
  const resolveOwner = (c, member) => {
    const seen = new Set();
    while (c && appClasses.has(c) && !seen.has(c)) {
      seen.add(c);
      const r = appClasses.get(c);
      if (r.declared.has(member)) return null;
      for (const i of r.interfaces) if (appClasses.get(i)?.declared.has(member)) return null;
      c = r.super;
    }
    return c;
  };
  for (const r of appClasses.values()) {
    for (const c of [...r.classes, r.super, ...r.interfaces]) {
      const base = c?.replace(/^\[+L?|;$/g, '');
      if (isPlatform(base) && !appClasses.has(base) && !rtClasses.has(base)) jarMissingClass.add(base);
    }
    for (const m of r.members) {
      const dot = m.indexOf('.');
      let owner = m.slice(0, dot);
      const member = m.slice(dot + 1);
      if (owner.startsWith('[')) continue;
      if (appClasses.has(owner)) owner = resolveOwner(owner, member);
      if (!isPlatform(owner) || appClasses.has(owner)) continue;
      // interface methods of app interfaces, or members only available through app superinterfaces
      if (owner === 'java/lang/Object' && !rtHas(owner, member)) continue;
      if (prefix && owner.startsWith(prefix)) jarUsed.add(`${owner}.${member}`);
      if (!rtClasses.has(owner)) continue;
      if (!rtHas(owner, member)) jarMissingMember.add(`${owner}.${member}`);
    }
  }
  for (const c of jarMissingClass) missingClass.set(c, (missingClass.get(c) ?? 0) + 1);
  for (const m of jarMissingMember) missingMember.set(m, (missingMember.get(m) ?? 0) + 1);
  for (const m of jarUsed) used.set(m, (used.get(m) ?? 0) + 1);
}

const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
const filt = (m) => new Map([...m].filter(([k]) => !prefix || k.startsWith(prefix)));
console.log(`${jars.length} jars`);
console.log(`\nmissing classes (${filt(missingClass).size}):`);
for (const [c, n] of top(filt(missingClass), showAll ? 1e9 : 80)) console.log(`${String(n).padStart(5)} ${c}`);
console.log(`\nmissing members of existing classes (${filt(missingMember).size}):`);
for (const [c, n] of top(filt(missingMember), showAll ? 1e9 : 80)) console.log(`${String(n).padStart(5)} ${c}`);
if (prefix) {
  console.log(`\nall used members under ${prefix} (${used.size}):`);
  for (const [c, n] of top(used, 1e9)) console.log(`${String(n).padStart(5)} ${c}`);
}
