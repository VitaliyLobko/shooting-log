// IndexedDB: одна база, по сховищу на кожну сутність, ключ — поле id.
// Кожен запис має updated (мс), видалення лишають надгробок у tombstones —
// це потрібно, щоб синхронізація з Google Диском зливала зміни без втрат.
const DB_NAME = 'shooting-log';
const DB_VERSION = 2;
export const STORES = ['weapons', 'cartridges', 'components', 'recipes', 'movements'];
const ALL = [...STORES, 'tombstones'];

let opening;

function open() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ALL) {
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
    fn(tx);
    tx.oncomplete = () => resolve();
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

/** changes: { store: { put: [obj], del: [id] } } — усе в одній транзакції, з відміткою часу. */
export async function write(changes) {
  const names = Object.keys(changes).filter((n) => STORES.includes(n));
  const now = Date.now();
  await run([...names, 'tombstones'], 'readwrite', (tx) => {
    const graves = tx.objectStore('tombstones');
    for (const name of names) {
      const store = tx.objectStore(name);
      for (const obj of changes[name].put ?? []) store.put({ ...obj, updated: now });
      for (const id of changes[name].del ?? []) {
        store.delete(id);
        graves.put({ id, store: name, updated: now });
      }
    }
  });
  window.dispatchEvent(new Event('db-change'));
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

export async function clearAll() {
  await run(ALL, 'readwrite', (tx) => {
    for (const name of ALL) tx.objectStore(name).clear();
  });
}
