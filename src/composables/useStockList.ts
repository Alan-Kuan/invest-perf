import type { SqlValue } from 'sql.js/dist/sql-wasm.js';
import { ref } from 'vue';

import { getDatabase, saveDatabase } from '../db';

interface Stock {
  ticker: string;
  name: string;
}

const stockList = ref<Stock[]>([]);
const isLoading = ref(false);

export function useStockList() {
  const loadStockList = async (): Promise<Stock[]> => {
    if (stockList.value.length > 0) {
      return stockList.value;
    }

    if (isLoading.value) {
      return [];
    }

    isLoading.value = true;

    const db = getDatabase();

    if (db) {
      const result = db.exec('SELECT ticker, name FROM stocks ORDER BY ticker');
      if (result.length > 0 && result[0].values.length > 0) {
        stockList.value = result[0].values.map((row: SqlValue[]) => ({
          ticker: row[0] as string,
          name: row[1] as string,
        }));
        isLoading.value = false;
        return stockList.value;
      }
    }

    try {
      const [stockResponse, etfResponse] = await Promise.all([
        fetch('/api/twse/v1/exchangeReport/BWIBBU_d'),
        fetch('/api/twse/v1/exchangeReport/TWT53U'),
      ]);

      const [stockData, etfData] = await Promise.all([stockResponse.json(), etfResponse.json()]);

      const stockMap = new Map<string, string>();

      if (Array.isArray(stockData)) {
        for (const item of stockData) {
          stockMap.set(item.Code, item.Name);
        }
      }

      if (Array.isArray(etfData)) {
        for (const item of etfData) {
          if (!stockMap.has(item.Code)) {
            stockMap.set(item.Code, item.Name);
          }
        }
      }

      const stocks: Stock[] = Array.from(stockMap.entries()).map(([ticker, name]) => ({
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

      stockList.value = stocks;
    } catch (e) {
      console.error('Failed to fetch stock list:', e);
    }

    isLoading.value = false;
    return stockList.value;
  };

  const addStock = async (stock: Stock): Promise<void> => {
    if (!stock.ticker) return;

    const exists = stockList.value.find(s => s.ticker === stock.ticker);
    if (!exists) {
      const db = getDatabase();
      if (db) {
        db.run('INSERT OR REPLACE INTO stocks (ticker, name) VALUES (?, ?)', [
          stock.ticker,
          stock.name || '',
        ]);
        await saveDatabase();
      }

      stockList.value.push({ ticker: stock.ticker, name: stock.name || '' });
      stockList.value.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }
  };

  function searchStocks(query: string): Stock[] {
    if (!query || query.length < 1) return [];

    const q = query.toUpperCase();
    const list = stockList.value.length > 0 ? stockList.value : [];

    const results = list.filter(s => {
      const tickerMatch = s.ticker.includes(q);
      const nameMatch = s.name.includes(query) || s.name.toUpperCase().includes(q);
      return tickerMatch || nameMatch;
    });

    results.sort((a, b) => {
      const aStarts = a.ticker.startsWith(q) || a.name.startsWith(query);
      const bStarts = b.ticker.startsWith(q) || b.name.startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.ticker.localeCompare(b.ticker);
    });

    return results.slice(0, 15);
  }

  return {
    stockList,
    isLoading,
    loadStockList,
    addStock,
    searchStocks,
  };
}
