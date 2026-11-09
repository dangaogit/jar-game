/** Save-state slots in IndexedDB: small metadata records plus the (large) state blobs in a separate store. */

export interface SlotMeta {
  /** `${game}#${slot}` */
  key: string;
  game: string;
  slot: number;
  time: number;
  size: number;
  /** data: URL of a small screenshot */
  thumb: string;
}

const DB_NAME = 'jargame';
const META = 'slots';
const DATA = 'states';

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA);
      if (!db.objectStoreNames.contains('games')) db.createObjectStore('games', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('jars')) db.createObjectStore('jars');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const slotKey = (game: string, slot: number) => `${game}#${slot}`;

export async function listSlots(game: string): Promise<SlotMeta[]> {
  const tx = (await db()).transaction(META);
  const range = IDBKeyRange.bound(`${game}#`, `${game}#\uffff`);
  return done(tx.objectStore(META).getAll(range) as IDBRequest<SlotMeta[]>);
}

export async function putSlot(meta: SlotMeta, data: Uint8Array) {
  const tx = (await db()).transaction([META, DATA], 'readwrite');
  tx.objectStore(META).put(meta);
  tx.objectStore(DATA).put(data, meta.key);
  await committed(tx);
}

export async function readSlot(key: string): Promise<Uint8Array | null> {
  const tx = (await db()).transaction(DATA);
  return ((await done(tx.objectStore(DATA).get(key))) as Uint8Array | undefined) ?? null;
}

export async function deleteSlot(key: string) {
  const tx = (await db()).transaction([META, DATA], 'readwrite');
  tx.objectStore(META).delete(key);
  tx.objectStore(DATA).delete(key);
  await committed(tx);
}

export interface LibraryGame {
  id: string;
  name: string;
  vendor: string;
  fileName: string;
  played: number;
  icon: string;
}

export async function listGames(): Promise<LibraryGame[]> {
  const tx = (await db()).transaction('games');
  const games = await done(tx.objectStore('games').getAll()) as LibraryGame[];
  return games.sort((a, b) => b.played - a.played);
}

export async function putGame(meta: LibraryGame, bytes: Uint8Array) {
  const tx = (await db()).transaction(['games', 'jars'], 'readwrite');
  tx.objectStore('games').put(meta);
  tx.objectStore('jars').put(bytes, meta.id);
  await committed(tx);
}

export async function readGame(id: string): Promise<Uint8Array | undefined> {
  const tx = (await db()).transaction('jars');
  return done(tx.objectStore('jars').get(id));
}

export async function deleteGame(id: string) {
  const tx = (await db()).transaction(['games', 'jars'], 'readwrite');
  tx.objectStore('games').delete(id);
  tx.objectStore('jars').delete(id);
  await committed(tx);
}
