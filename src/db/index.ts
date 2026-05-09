import initSqlJs, { Database } from 'sql.js/dist/sql-wasm.js';

import { DB_NAME, STORE_NAME } from './constants';
import { getStoreItem, setStoreItem, clearStore } from './idb';
import { createTables } from './sqlite';

let db: Database | null = null;

async function saveToIndexedDB(data: Uint8Array): Promise<void> {
  await setStoreItem(STORE_NAME, DB_NAME, data);
}

async function loadFromIndexedDB(): Promise<Uint8Array | undefined> {
  return await getStoreItem(STORE_NAME, DB_NAME);
}

async function clearIndexedDB(): Promise<void> {
  await clearStore(STORE_NAME);
}

export async function initDatabase(): Promise<Database> {
  const sql_js = await initSqlJs({
    locateFile: () => `${import.meta.env.BASE_URL}sql-wasm.wasm`,
  });

  const saved_data = await loadFromIndexedDB();

  if (saved_data && saved_data.length > 0) {
    db = new sql_js.Database(new Uint8Array(saved_data));
  } else {
    db = new sql_js.Database();
  }

  createTables(db);
  await saveDatabase();

  return db;
}

export async function saveDatabase(): Promise<void> {
  if (!db) return;
  const data = db.export();
  await saveToIndexedDB(new Uint8Array(data));
}

export async function clearDatabase(): Promise<void> {
  await clearIndexedDB();
  db = null;
}

export function getDatabase(): Database | null {
  return db;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export async function exportDatabase(): Promise<Uint8Array | null> {
  if (!db) return null;
  const data = db.export();
  return new Uint8Array(data);
}

export async function importDatabase(uint8Array: Uint8Array): Promise<void> {
  const sql_js = await initSqlJs();
  db = new sql_js.Database(uint8Array);
  createTables(db);
  await saveDatabase();
}

// Re-export IDB helpers for backward compatibility with useStockPrice.ts and App.vue
export { getStoreItem, setStoreItem, clearStore };
