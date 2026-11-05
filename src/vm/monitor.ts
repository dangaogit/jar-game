import { Monitor, type JObject, type JThread } from './runtime';

export function monitorEnter(t: JThread, o: JObject): boolean {
  const m = (o.mon ??= new Monitor());
  if (m.owner === null) {
    m.owner = t;
    m.count = 1;
    return true;
  }
  if (m.owner === t) {
    m.count++;
    return true;
  }
  return false;
}

export function monitorExit(t: JThread, o: JObject): boolean {
  const m = o.mon;
  if (!m || m.owner !== t) return false;
  if (--m.count === 0) m.owner = null;
  return true;
}
