import { useDatabase } from './useDatabase';

const historical_price_cache = new Map<string, Map<string, number | string>>();

let last_request_time = 0;
const MIN_REQUEST_INTERVAL = 1700;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function useStockPrice() {
  const { query, execute } = useDatabase();

  function loadFromDb(ticker: string, date: string): number | null {
    const results = query('SELECT price FROM historical_prices WHERE ticker = ? AND date = ?', [
      ticker,
      date,
    ]);
    if (results.length > 0 && results[0].price !== null) {
      return results[0].price as number;
    }
    return null;
  }

  async function saveToDb(ticker: string, date: string, price: number): Promise<void> {
    await execute(
      `INSERT OR REPLACE INTO historical_prices (ticker, date, price, updated_at) VALUES (?, ?, ?, datetime('now'))`,
      [ticker, date, price],
    );
  }

  async function fetchPricesBatch(tickers: string[]): Promise<Record<string, number>> {
    if (tickers.length === 0) return {};

    try {
      const codes = tickers.map(t => `tse_${t}.tw`).join('|');
      const url = `/api/mis/stock/api/getStockInfo.jsp?ex_ch=${codes}&json=1&delay=0`;

      const controller = new AbortController();
      const timeout_id = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout_id);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      if (!text || text.trim() === '') {
        return {};
      }

      const data = JSON.parse(text);
      const prices: Record<string, number> = {};

      if (data.msgArray) {
        for (const item of data.msgArray) {
          const code = item.c;
          const price = parseFloat(item.z);
          if (code && !isNaN(price)) {
            prices[code] = price;
          }
        }
      }
      return prices;
    } catch (e) {
      console.error('Batch fetch failed:', e);
      return {};
    }
  }

  async function fetchHistoricalPrice(ticker: string, date: string): Promise<number | null> {
    const cached = historical_price_cache.get(ticker)?.get(date);

    if (cached !== undefined && typeof cached === 'number') {
      return cached;
    }

    const db_price = loadFromDb(ticker, date);
    if (db_price !== null) {
      if (!historical_price_cache.has(ticker)) {
        historical_price_cache.set(ticker, new Map());
      }
      historical_price_cache.get(ticker)!.set(date, db_price);
      return db_price;
    }

    const now = Date.now();
    if (now - last_request_time < MIN_REQUEST_INTERVAL) {
      await delay(MIN_REQUEST_INTERVAL - (now - last_request_time));
    }
    last_request_time = Date.now();

    try {
      const date_str = date.replace(/-/g, '');
      const response = await fetch(
        `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${date_str}&stockNo=${ticker}`,
      );

      if (!response.ok || response.status !== 200) {
        console.warn(`HTTP error for ${ticker} on ${date}: ${response.status}`);
        return null;
      }

      const data = await response.json();

      if (data.stat === 'OK' && data.data && data.data.length > 0) {
        const roc_date = `${parseInt(date.substring(0, 4)) - 1911}/${date.substring(5, 7)}/${date.substring(8, 10)}`;
        let target_row: string[] | undefined;

        for (const row of data.data) {
          if (row[0] <= roc_date) {
            if (!target_row || row[0] > target_row[0]) {
              target_row = row;
            }
          }
        }

        if (target_row) {
          const price = parseFloat(target_row[6].replace(/,/g, ''));
          if (!isNaN(price) && price > 0) {
            if (!historical_price_cache.has(ticker)) {
              historical_price_cache.set(ticker, new Map());
            }
            historical_price_cache.get(ticker)!.set(date, price);
            await saveToDb(ticker, date, price);
            return price;
          }
        }
      }
    } catch (e) {
      console.error(`Failed to fetch historical price for ${ticker} on ${date}:`, e);
    }

    return null;
  }

  return {
    fetchPricesBatch,
    fetchHistoricalPrice,
  };
}
