/** Record Management System backend, persisted per game through a key/value store. */

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface Store {
  version: number;
  lastModified: number;
  nextId: number;
  records: Map<number, Uint8Array>;
}

interface StoreJson {
  version: number;
  lastModified: number;
  nextId: number;
  records: [number, string][];
}

function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 0x8000)));
  return btoa(s);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class Rms {
  private stores = new Map<string, Store>();

  constructor(
    private kv: KeyValueStore | null,
    private gameId: string,
  ) {
    const index = this.kv?.getItem(this.indexKey());
    for (const name of index ? (JSON.parse(index) as string[]) : []) {
      const raw = this.kv!.getItem(this.storeKey(name));
      if (raw) this.stores.set(name, this.decode(JSON.parse(raw)));
    }
  }

  private indexKey() {
    return `jargame:rms:${this.gameId}`;
  }

  private storeKey(name: string) {
    return `jargame:rms:${this.gameId}:${name}`;
  }

  private decode(j: StoreJson): Store {
    return {
      version: j.version,
      lastModified: j.lastModified,
      nextId: j.nextId,
      records: new Map(j.records.map(([id, b]) => [id, fromBase64(b)])),
    };
  }

  private encode(s: Store): StoreJson {
    return {
      version: s.version,
      lastModified: s.lastModified,
      nextId: s.nextId,
      records: [...s.records].map(([id, b]) => [id, toBase64(b)]),
    };
  }

  private persist(name: string) {
    if (!this.kv) return;
    const s = this.stores.get(name);
    if (s) this.kv.setItem(this.storeKey(name), JSON.stringify(this.encode(s)));
    else this.kv.removeItem(this.storeKey(name));
    this.kv.setItem(this.indexKey(), JSON.stringify([...this.stores.keys()]));
  }

  private touch(name: string, s: Store) {
    s.version++;
    s.lastModified = Date.now();
    this.persist(name);
  }

  list(): string[] {
    return [...this.stores.keys()];
  }

  open(name: string, create: boolean): boolean {
    if (this.stores.has(name)) return true;
    if (!create) return false;
    this.stores.set(name, { version: 0, lastModified: Date.now(), nextId: 1, records: new Map() });
    this.persist(name);
    return true;
  }

  delete(name: string): boolean {
    if (!this.stores.delete(name)) return false;
    this.persist(name);
    return true;
  }

  get(name: string) {
    return this.stores.get(name);
  }

  add(name: string, data: Uint8Array): number {
    const s = this.stores.get(name)!;
    const id = s.nextId++;
    s.records.set(id, data);
    this.touch(name, s);
    return id;
  }

  set(name: string, id: number, data: Uint8Array): boolean {
    const s = this.stores.get(name)!;
    if (!s.records.has(id)) return false;
    s.records.set(id, data);
    this.touch(name, s);
    return true;
  }

  remove(name: string, id: number): boolean {
    const s = this.stores.get(name)!;
    if (!s.records.delete(id)) return false;
    this.touch(name, s);
    return true;
  }

  /** all stores of this game as JSON (save export) */
  exportJson(): string {
    return JSON.stringify(Object.fromEntries([...this.stores].map(([n, s]) => [n, this.encode(s)])));
  }

  importJson(json: string) {
    const data = JSON.parse(json) as Record<string, StoreJson>;
    for (const name of [...this.stores.keys()]) this.delete(name);
    for (const [name, s] of Object.entries(data)) {
      this.stores.set(name, this.decode(s));
      this.persist(name);
    }
  }
}
