import { ref } from 'vue';

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

    const stored = localStorage.getItem('stock_list_cache');
    if (stored) {
      try {
        const cached_map = JSON.parse(stored) as Record<string, string>;
        stock_list.value = Object.entries(cached_map)
          .map(([ticker, name]) => ({
            ticker,
            name,
          }))
          .sort((a, b) => a.ticker.localeCompare(b.ticker));
        is_loading.value = false;
        return stock_list.value;
      } catch {
        // continue to fetch
      }
    }

    try {
      const [stock_res, etf_res] = await Promise.all([
        fetch('/api/twse/v1/exchangeReport/BWIBBU_d'),
        fetch('/api/twse/v1/exchangeReport/TWT53U'),
      ]);

      const [stock_data, etf_data] = await Promise.all([stock_res.json(), etf_res.json()]);

      const stock_map: Record<string, string> = {};

      if (Array.isArray(stock_data)) {
        for (const item of stock_data) {
          stock_map[item.Code] = item.Name;
        }
      }

      if (Array.isArray(etf_data)) {
        for (const item of etf_data) {
          if (!stock_map[item.Code]) {
            stock_map[item.Code] = item.Name;
          }
        }
      }

      localStorage.setItem('stock_list_cache', JSON.stringify(stock_map));
      stock_list.value = Object.entries(stock_map)
        .map(([ticker, name]) => ({
          ticker,
          name,
        }))
        .sort((a, b) => a.ticker.localeCompare(b.ticker));
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
      const stored = localStorage.getItem('stock_list_cache');
      const stock_map = stored ? (JSON.parse(stored) as Record<string, string>) : {};

      stock_map[stock.ticker] = stock.name || '';
      localStorage.setItem('stock_list_cache', JSON.stringify(stock_map));

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
