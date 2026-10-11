// IndexedDB: одна база, по сховищу на кожну сутність, ключ — поле id.
// Кожен запис має updated (мс), видалення лишають надгробок у tombstones —
// це потрібно, щоб синхронізація з Google Диском зливала зміни без втрат.
// Файли фото лежать окремо в blobs: вони не входять у JSON синхронізації й резервної копії.
const DB_NAME = 'shooting-log';
const DB_VERSION = 3;
export const STORES = ['weapons', 'cartridges', 'components', 'recipes', 'movements', 'photos'];
const ALL = [...STORES, 'tombstones'];
const BLOBS = 'blobs';

let opening;

function open() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [...ALL, BLOBS]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

async function run(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const out = fn(tx);
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function uid() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadAll() {
  const state = {};
  await run(ALL, 'readonly', (tx) => {
    for (const name of ALL) {
      const req = tx.objectStore(name).getAll();
      req.onsuccess = () => { state[name] = req.result; };
    }
  });
  return state;
}

/**
 * changes: { store: { put: [obj], del: [id] }, blobs?: { put: [{ id, blob }], del: [id] } } —
 * усе в одній транзакції, з відміткою часу.
 */
export async function write(changes) {
  const names = Object.keys(changes).filter((n) => STORES.includes(n));
  const blobs = changes[BLOBS];
  const now = Date.now();
  await run([...names, 'tombstones', ...(blobs ? [BLOBS] : [])], 'readwrite', (tx) => {
    const graves = tx.objectStore('tombstones');
    for (const name of names) {
      const store = tx.objectStore(name);
      for (const obj of changes[name].put ?? []) store.put({ ...obj, updated: now });
      for (const id of changes[name].del ?? []) {
        store.delete(id);
        graves.put({ id, store: name, updated: now });
      }
    }
    if (blobs) {
      const store = tx.objectStore(BLOBS);
      for (const obj of blobs.put ?? []) store.put(obj);
      for (const id of blobs.del ?? []) store.delete(id);
    }
  });
  window.dispatchEvent(new Event('db-change'));
}

/** Доповнити запис полями, лише якщо він ще існує. Повертає true, якщо записано. */
export function patch(name, id, fields) {
  return run([name], 'readwrite', (tx) => {
    const result = { ok: false };
    const store = tx.objectStore(name);
    store.get(id).onsuccess = (e) => {
      if (!e.target.result) return;
      store.put({ ...e.target.result, ...fields, updated: Date.now() });
      result.ok = true;
    };
    return result;
  }).then((r) => r.ok);
}

const stamp = (x) => Number(x?.updated) || 0;

/**
 * Результат злиття з Диска: { store: { put: [obj], del: [{ id, updated }] } }.
 * Нічого не перезаписує, якщо локальний запис встиг змінитися пізніше.
 */
export function writeMerged(changes) {
  const names = Object.keys(changes).filter((n) => ALL.includes(n));
  return run(names, 'readwrite', (tx) => {
    for (const name of names) {
      const store = tx.objectStore(name);
      for (const obj of changes[name].put ?? []) {
        store.get(obj.id).onsuccess = (e) => { if (stamp(e.target.result) <= stamp(obj)) store.put(obj); };
      }
      for (const grave of changes[name].del ?? []) {
        store.get(grave.id).onsuccess = (e) => { if (e.target.result && stamp(e.target.result) <= stamp(grave)) store.delete(grave.id); };
      }
    }
  });
}

export async function getBlob(id) {
  return run([BLOBS], 'readonly', (tx) => {
    const out = {};
    tx.objectStore(BLOBS).get(id).onsuccess = (e) => { out.blob = e.target.result?.blob ?? null; };
    return out;
  }).then((r) => r.blob);
}

export function putBlob(id, blob) {
  return run([BLOBS], 'readwrite', (tx) => { tx.objectStore(BLOBS).put({ id, blob }); });
}

export function blobKeys() {
  return run([BLOBS], 'readonly', (tx) => {
    const out = { keys: [] };
    tx.objectStore(BLOBS).getAllKeys().onsuccess = (e) => { out.keys = e.target.result; };
    return out;
  }).then((r) => r.keys);
}

/**
 * Прибрати файли фото, для яких уже немає запису (видалені на іншому пристрої).
 * Записи читаються в тій самій транзакції — фото, додане під час синхронізації, не зачепить.
 */
export function dropOrphanBlobs() {
  return run(['photos', BLOBS], 'readwrite', (tx) => {
    tx.objectStore('photos').getAllKeys().onsuccess = (e) => {
      const keep = new Set(e.target.result);
      const blobs = tx.objectStore(BLOBS);
      blobs.getAllKeys().onsuccess = (ev) => {
        for (const id of ev.target.result) if (!keep.has(id)) blobs.delete(id);
      };
    };
  });
}

export function get(name, id) {
  return run([name], 'readonly', (tx) => {
    const out = {};
    tx.objectStore(name).get(id).onsuccess = (e) => { out.rec = e.target.result ?? null; };
    return out;
  }).then((r) => r.rec);
}

export async function clearAll() {
  await run([...ALL, BLOBS], 'readwrite', (tx) => {
    for (const name of [...ALL, BLOBS]) tx.objectStore(name).clear();
  });
}
