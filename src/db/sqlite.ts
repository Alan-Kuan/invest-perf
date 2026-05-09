import { Database } from 'sql.js/dist/sql-wasm.js';

export function tableExists(db: Database, table_name: string): boolean {
  const result = db.exec(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${table_name}'`,
  );

  return result.length > 0 && result[0].values.length > 0;
}

export function columnExists(db: Database, table_name: string, column_name: string): boolean {
  if (!tableExists(db, table_name)) return false;

  const result = db.exec(`PRAGMA table_info(${table_name})`);
  if (result.length === 0) return false;

  return result[0].values.some(row => String(row[1]) === column_name);
}

export function ensureMarketColumn(db: Database, table_name: string): void {
  if (!columnExists(db, table_name, 'market')) {
    db.run(`ALTER TABLE ${table_name} ADD COLUMN market TEXT NOT NULL DEFAULT 'tw'`);
  }

  db.run(`UPDATE ${table_name} SET market = 'tw' WHERE market IS NULL OR market = ''`);
}

export function createTables(db: Database): void {
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

  ensureMarketColumn(db, 'transactions');
  ensureMarketColumn(db, 'dividends');

  db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_ticker ON transactions(ticker)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_market ON transactions(market)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_dividends_date ON dividends(pay_date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_dividends_ticker ON dividends(ticker)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_dividends_market ON dividends(market)`);
}
