import initSqlJs, { Database } from 'sql.js/dist/sql-wasm.js';

let db: Database | null = null;

const DB_NAME = 'invest_perf.db';
const STORE_NAME = 'invest_perf_data';
const IDB_NAME = 'invest_perf';
const IDB_VERSION = 7;

let idb_instance: IDBDatabase | null = null;

function tableExists(table_name: string): boolean {
  if (!db) return false;

  const result = db.exec(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${table_name}'`,
  );

  return result.length > 0 && result[0].values.length > 0;
}

function columnExists(table_name: string, column_name: string): boolean {
  if (!db || !tableExists(table_name)) return false;

  const result = db.exec(`PRAGMA table_info(${table_name})`);
  if (result.length === 0) return false;

  return result[0].values.some(row => String(row[1]) === column_name);
}

function ensureMarketColumn(table_name: string): void {
  if (!db) return;

  if (!columnExists(table_name, 'market')) {
    db.run(`ALTER TABLE ${table_name} ADD COLUMN market TEXT NOT NULL DEFAULT 'tw'`);
  }

  db.run(`UPDATE ${table_name} SET market = 'tw' WHERE market IS NULL OR market = ''`);
}

function migrateHistoricalPricesTable(): void {
  if (!db || !tableExists('historical_prices')) return;

  if (!columnExists('historical_prices', 'market')) {
    db.run('ALTER TABLE historical_prices RENAME TO historical_prices_legacy');
    db.run(`
      CREATE TABLE IF NOT EXISTS historical_prices (
        market TEXT NOT NULL DEFAULT 'tw',
        ticker TEXT NOT NULL,
        date TEXT NOT NULL,
        price REAL NOT NULL,
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (market, ticker, date)
      )
    `);
    db.run(`
      INSERT INTO historical_prices (market, ticker, date, price, updated_at)
      SELECT 'tw', ticker, date, price, updated_at
      FROM historical_prices_legacy
    `);
    db.run('DROP TABLE historical_prices_legacy');
  }
}

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
    locateFile: () => `${import.meta.env.BASE_URL}sql-wasm.wasm`,
  });

  const saved_data = await loadFromIndexedDB();

  if (saved_data && saved_data.length > 0) {
    db = new sql_js.Database(new Uint8Array(saved_data));
  } else {
    db = new sql_js.Database();
  }

  createTables();
  await saveDatabase();

  return db;
}

function createTables(): void {
  if (!db) return;

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      ticker TEXT NOT NULL,
      name TEXT,
      market TEXT NOT NULL DEFAULT 'tw',
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
      market TEXT NOT NULL DEFAULT 'tw',
      category TEXT NOT NULL CHECK(category IN ('cash', 'stock')),
      shares INTEGER NOT NULL,
      per_share REAL NOT NULL,
      fee REAL DEFAULT 0,
      amount REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS historical_prices (
      market TEXT NOT NULL DEFAULT 'tw',
      ticker TEXT NOT NULL,
      date TEXT NOT NULL,
      price REAL NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (market, ticker, date)
    )
  `);

  ensureMarketColumn('transactions');
  ensureMarketColumn('dividends');
  migrateHistoricalPricesTable();

  db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_ticker ON transactions(ticker)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_market ON transactions(market)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_dividends_date ON dividends(pay_date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_dividends_ticker ON dividends(ticker)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_dividends_market ON dividends(market)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_historical_prices_ticker ON historical_prices(ticker)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_historical_prices_market ON historical_prices(market)`);
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
  createTables();
  await saveDatabase();
}
