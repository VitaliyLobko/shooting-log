// IndexedDB: одна база, по сховищу на кожну сутність, ключ — поле id.
const DB_NAME = 'shooting-log';
const DB_VERSION = 1;
export const STORES = ['weapons', 'cartridges', 'components', 'recipes', 'movements'];

let opening;

function open() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
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
    const result = fn(tx);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function uid() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadAll() {
  const state = {};
  await run(STORES, 'readonly', (tx) => {
    for (const name of STORES) {
      const req = tx.objectStore(name).getAll();
      req.onsuccess = () => { state[name] = req.result; };
    }
  });
  return state;
}

/** changes: { store: { put: [obj], del: [id] } } — усе в одній транзакції. */
export function write(changes) {
  const names = Object.keys(changes);
  return run(names, 'readwrite', (tx) => {
    for (const name of names) {
      const store = tx.objectStore(name);
      for (const obj of changes[name].put ?? []) store.put(obj);
      for (const id of changes[name].del ?? []) store.delete(id);
    }
  });
}

export function clearAll() {
  return run(STORES, 'readwrite', (tx) => {
    for (const name of STORES) tx.objectStore(name).clear();
  });
}
