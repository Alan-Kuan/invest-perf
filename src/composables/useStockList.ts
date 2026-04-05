import type { SqlValue } from 'sql.js/dist/sql-wasm.js';
import { ref } from 'vue';

import { getDatabase, saveDatabase } from '../db';

interface Stock {
  ticker: string;
  name: string;
}

const stock_list = ref<Stock[]>([]);
const is_loading = ref(false);

export function useStockList() {
  async function loadStockList(): Promise<Stock[]> {
    if (stock_list.value.length > 0) {
      return stock_list.value;
    }

    if (is_loading.value) {
      return [];
    }

    is_loading.value = true;

    const db = getDatabase();

    if (db) {
      const result = db.exec('SELECT ticker, name FROM stocks ORDER BY ticker');
      if (result.length > 0 && result[0].values.length > 0) {
        stock_list.value = result[0].values.map((row: SqlValue[]) => ({
          ticker: row[0] as string,
          name: row[1] as string,
        }));
        is_loading.value = false;
        return stock_list.value;
      }
    }

    try {
      const [stock_res, etf_res] = await Promise.all([
        fetch('/api/twse/v1/exchangeReport/BWIBBU_d'),
        fetch('/api/twse/v1/exchangeReport/TWT53U'),
      ]);

      const [stock_data, etf_data] = await Promise.all([stock_res.json(), etf_res.json()]);

      const stock_map = new Map<string, string>();

      if (Array.isArray(stock_data)) {
        for (const item of stock_data) {
          stock_map.set(item.Code, item.Name);
        }
      }

      if (Array.isArray(etf_data)) {
        for (const item of etf_data) {
          if (!stock_map.has(item.Code)) {
            stock_map.set(item.Code, item.Name);
          }
        }
      }

      const stocks: Stock[] = Array.from(stock_map.entries()).map(([ticker, name]) => ({
        ticker,
        name,
      }));

      if (db && stocks.length > 0) {
        db.run('DELETE FROM stocks');
        const stmt = db.prepare('INSERT INTO stocks (ticker, name) VALUES (?, ?)');
        for (const stock of stocks) {
          stmt.run([stock.ticker, stock.name]);
        }
        stmt.free();
        await saveDatabase();
      }

      stock_list.value = stocks;
    } catch (e) {
      console.error('Failed to fetch stock list:', e);
    }

    is_loading.value = false;
    return stock_list.value;
  }

  async function addStock(stock: Stock): Promise<void> {
    if (!stock.ticker) return;

    const exists = stock_list.value.find(s => s.ticker === stock.ticker);
    if (!exists) {
      const db = getDatabase();
      if (db) {
        db.run('INSERT OR REPLACE INTO stocks (ticker, name) VALUES (?, ?)', [
          stock.ticker,
          stock.name || '',
        ]);
        await saveDatabase();
      }

      stock_list.value.push({ ticker: stock.ticker, name: stock.name || '' });
      stock_list.value.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }
  }

  function searchStocks(query: string): Stock[] {
    if (!query || query.length < 1) return [];

    const q = query.toUpperCase();
    const list = stock_list.value.length > 0 ? stock_list.value : [];

    const results = list.filter(s => {
      const ticker_match = s.ticker.includes(q);
      const name_match = s.name.includes(query) || s.name.toUpperCase().includes(q);
      return ticker_match || name_match;
    });

    results.sort((a, b) => {
      const a_starts = a.ticker.startsWith(q) || a.name.startsWith(query);
      const b_starts = b.ticker.startsWith(q) || b.name.startsWith(query);
      if (a_starts && !b_starts) return -1;
      if (!a_starts && b_starts) return 1;
      return a.ticker.localeCompare(b.ticker);
    });

    return results.slice(0, 15);
  }

  return {
    stock_list,
    is_loading,
    loadStockList,
    addStock,
    searchStocks,
  };
}
