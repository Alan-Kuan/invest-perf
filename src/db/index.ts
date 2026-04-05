import initSqlJs, { Database } from 'sql.js/dist/sql-wasm.js';

let db: Database | null = null;

const DB_NAME = 'invest_perf.db';
const STORE_NAME = 'invest_perf_data';
const IDB_NAME = 'invest_perf';
const IDB_VERSION = 7;

let idb_instance: IDBDatabase | null = null;

function openIndexedDB(): Promise<IDBDatabase> {
  if (idb_instance) return Promise.resolve(idb_instance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      idb_instance = request.result;
      resolve(request.result);
    };

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const idb = (event.target as IDBOpenDBRequest).result;
      if (!idb.objectStoreNames.contains(STORE_NAME)) {
        idb.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function saveToIndexedDB(data: Uint8Array): Promise<void> {
  const idb = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(data, DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function loadFromIndexedDB(): Promise<Uint8Array | undefined> {
  const idb = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearIndexedDB(): Promise<void> {
  const idb = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function initDatabase(): Promise<Database> {
  const sql_js = await initSqlJs({
    locateFile: () => '/sql-wasm.wasm',
  });

  const saved_data = await loadFromIndexedDB();

  if (saved_data && saved_data.length > 0) {
    db = new sql_js.Database(new Uint8Array(saved_data));
  } else {
    db = new sql_js.Database();
  }

  createTables();

  return db;
}

function createTables(): void {
  if (!db) return;

  const table_exists = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='annual_performance'",
  );

  if (table_exists.length > 0) {
    const columns = db.exec('PRAGMA table_info(annual_performance)');
    const has_old_columns = columns[0]?.values?.some((col: any) => col[1] === 'realized_gain');

    if (has_old_columns) {
      db.run('DROP TABLE annual_performance');
    }
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      ticker TEXT NOT NULL,
      name TEXT,
      type TEXT NOT NULL CHECK(type IN ('buy', 'sell')),
      shares INTEGER NOT NULL,
      price REAL NOT NULL,
      total REAL NOT NULL,
      fee REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      net_amount REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS dividends (
      id TEXT PRIMARY KEY,
      pay_date TEXT NOT NULL,
      ticker TEXT NOT NULL,
      name TEXT,
      category TEXT NOT NULL CHECK(category IN ('cash', 'stock')),
      shares INTEGER NOT NULL,
      per_share REAL NOT NULL,
      fee REAL DEFAULT 0,
      amount REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS prices (
      ticker TEXT PRIMARY KEY,
      price REAL NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS stocks (
      ticker TEXT PRIMARY KEY,
      name TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS annual_performance (
      year INTEGER PRIMARY KEY,
      realized_return_rate REAL NOT NULL,
      unrealized_return_rate REAL NOT NULL,
      total_return_rate REAL NOT NULL,
      calculated_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS historical_prices (
      ticker TEXT NOT NULL,
      date TEXT NOT NULL,
      price REAL NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (ticker, date)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_ticker ON transactions(ticker)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_dividends_date ON dividends(pay_date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_dividends_ticker ON dividends(ticker)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_historical_prices_ticker ON historical_prices(ticker)`);
}

export async function saveDatabase(): Promise<void> {
  if (!db) return;
  const data = db.export();
  await saveToIndexedDB(new Uint8Array(data));
}

export async function clearDatabase(): Promise<void> {
  await clearIndexedDB();
  db = null;
  indexedDB.deleteDatabase(IDB_NAME);
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
  await saveDatabase();
}
