// Saved tanks, kept in the browser so they survive reloading the page.
const DB = 'marbler-saves';
const STORE = 'saves';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const listSaves = () => run('readonly', (s) => s.getAll());
export const addSave = (save) => run('readwrite', (s) => s.add(save));
export const deleteSave = (id) => run('readwrite', (s) => s.delete(id));
