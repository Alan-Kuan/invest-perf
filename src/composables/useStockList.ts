import { ref } from 'vue';
import { getDatabase, saveDatabase } from '../db';
import type { SqlValue } from 'sql.js/dist/sql-wasm.js';

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
        stockList.value = result[0].values.map((row: SqlValue[]) => ({ ticker: row[0] as string, name: row[1] as string }));
        isLoading.value = false;
        return stockList.value;
      }
    }

    try {
      const response = await fetch('/api/twse/v1/exchangeReport/BWIBBU_d');
      const data = await response.json();

      if (Array.isArray(data)) {
        const stocks: Stock[] = data.map(item => ({
          ticker: item.Code,
          name: item.Name
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
      }
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
        db.run('INSERT OR REPLACE INTO stocks (ticker, name) VALUES (?, ?)', [stock.ticker, stock.name || '']);
        await saveDatabase();
      }

      stockList.value.push({ ticker: stock.ticker, name: stock.name || '' });
      stockList.value.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }
  };

  const searchStocks = (query: string): Stock[] => {
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
  };

  return {
    stockList,
    isLoading,
    loadStockList,
    addStock,
    searchStocks
  };
}
