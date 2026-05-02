import { buildCorsProxyUrl } from '../utils/cors-proxy';
import { DEFAULT_MARKET, normalizeMarket, type Market } from '../utils/market';
import { useDatabase } from './useDatabase';

const historical_price_cache = new Map<string, Map<string, number>>();

let last_yahoo_request_time = 0;
let yahoo_request_queue: Promise<unknown> = Promise.resolve();
const MIN_REQUEST_INTERVAL = 1700;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toYahooSymbol(ticker: string): string {
  return ticker.trim().replace(/\./g, '-').toUpperCase();
}

function scheduleYahooRequest<T>(request: () => Promise<T>): Promise<T> {
  const next_request = yahoo_request_queue.then(async () => {
    const now = Date.now();
    const wait_time = Math.max(0, MIN_REQUEST_INTERVAL - (now - last_yahoo_request_time));
    if (wait_time > 0) {
      await delay(wait_time);
    }
    last_yahoo_request_time = Date.now();
    return request();
  });

  yahoo_request_queue = next_request.then(
    () => undefined,
    () => undefined,
  );

  return next_request;
}

export function useStockPrice() {
  const { query, execute } = useDatabase();

  const loadFromDb = (market: Market, ticker: string, date: string): number | null => {
    const results = query(
      'SELECT price FROM historical_prices WHERE market = ? AND ticker = ? AND date = ?',
      [market, ticker, date],
    );
    if (results.length > 0 && results[0].price !== null) {
      return results[0].price as number;
    }
    return null;
  };

  const saveToDb = async (
    market: Market,
    ticker: string,
    date: string,
    price: number,
  ): Promise<void> => {
    await execute(
      `INSERT OR REPLACE INTO historical_prices (market, ticker, date, price, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [market, ticker, date, price],
    );
  };

  const getHistoricalCacheKey = (market: Market, ticker: string): string => {
    return `${market}:${ticker}`;
  };

  const fetchYahooCurrentPrice = async (ticker: string): Promise<number | null> => {
    const yahoo_symbol = toYahooSymbol(ticker);
    const chart_url = buildCorsProxyUrl(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo_symbol)}?range=1d&interval=1m&includePrePost=true&events=div,splits`,
    );

    try {
      const response = await scheduleYahooRequest(() => fetch(chart_url));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const result = data?.chart?.result?.[0];
      const meta = result?.meta || {};
      const price_candidates = [
        meta.currentPrice,
        meta.regularMarketPrice,
        meta.postMarketPrice,
        meta.preMarketPrice,
      ];

      for (const candidate of price_candidates) {
        const parsed_price = Number(candidate);
        if (!Number.isNaN(parsed_price) && parsed_price > 0) {
          return parsed_price;
        }
      }

      const closes = Array.isArray(result?.indicators?.quote?.[0]?.close)
        ? result.indicators.quote[0].close
        : Array.isArray(result?.indicators?.adjclose?.[0]?.adjclose)
          ? result.indicators.adjclose[0].adjclose
          : [];

      for (let index = closes.length - 1; index >= 0; index -= 1) {
        const parsed_price = Number(closes[index]);
        if (!Number.isNaN(parsed_price) && parsed_price > 0) {
          return parsed_price;
        }
      }
    } catch (e) {
      console.error(`Failed to fetch Yahoo current price for ${ticker}:`, e);
    }

    return null;
  };

  const fetchPricesBatch = async (
    tickers: string[],
    market: Market = DEFAULT_MARKET,
  ): Promise<Record<string, number>> => {
    if (tickers.length === 0) return {};

    const normalized_market = normalizeMarket(market);

    try {
      const prices: Record<string, number> = {};

      if (normalized_market === 'tw') {
        const codes = tickers.map(t => `tse_${t}.tw`).join('|');
        const url = buildCorsProxyUrl(
          `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${codes}&json=1&delay=0`,
        );

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

        if (data.msgArray) {
          for (const item of data.msgArray) {
            const code = item.c;
            const price = parseFloat(item.z);
            if (code && !isNaN(price)) {
              prices[code] = price;
            }
          }
        }
      } else {
        for (const ticker of tickers) {
          const price = await fetchYahooCurrentPrice(ticker);
          if (price !== null) {
            prices[ticker] = price;
          }
        }
      }

      return prices;
    } catch (e) {
      console.error('Batch fetch failed:', e);
      return {};
    }
  };

  const fetchTwHistoricalPrice = async (ticker: string, date: string): Promise<number | null> => {
    const date_str = date.replace(/-/g, '');
    const response = await fetch(
      buildCorsProxyUrl(
        `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${date_str}&stockNo=${ticker}`,
      ),
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
          return price;
        }
      }
    }

    return null;
  };

  const fetchYahooHistoricalPrice = async (
    ticker: string,
    date: string,
  ): Promise<number | null> => {
    const start_date = new Date(`${date}T00:00:00`);
    start_date.setDate(start_date.getDate() - 10);
    const end_date = new Date(`${date}T00:00:00`);
    end_date.setDate(end_date.getDate() + 1);

    const chart_url = buildCorsProxyUrl(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(toYahooSymbol(ticker))}?period1=${Math.floor(start_date.getTime() / 1000)}&period2=${Math.floor(end_date.getTime() / 1000)}&interval=1d&includePrePost=false&events=div,splits`,
    );

    const response = await scheduleYahooRequest(() => fetch(chart_url));

    if (!response.ok) {
      console.warn(`HTTP error for ${ticker} on ${date}: ${response.status}`);
      return null;
    }

    try {
      const data = await response.json();
      const result = data?.chart?.result?.[0];
      const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
      const closes = Array.isArray(result?.indicators?.quote?.[0]?.close)
        ? result.indicators.quote[0].close
        : Array.isArray(result?.indicators?.adjclose?.[0]?.adjclose)
          ? result.indicators.adjclose[0].adjclose
          : [];

      let matched_price: number | null = null;

      for (let index = 0; index < timestamps.length; index += 1) {
        const timestamp = timestamps[index];
        const close = Number(closes[index]);
        if (!timestamp || Number.isNaN(close) || close <= 0) continue;

        const point_date = new Date(timestamp * 1000).toISOString().slice(0, 10);
        if (point_date <= date) {
          matched_price = close;
        }
      }

      if (matched_price !== null) {
        return matched_price;
      }
    } catch (e) {
      console.error(`Failed to fetch Yahoo historical price for ${ticker} on ${date}:`, e);
    }

    return null;
  };

  const fetchHistoricalPrice = async (
    ticker: string,
    date: string,
    market: Market = DEFAULT_MARKET,
  ): Promise<number | null> => {
    const normalized_market = normalizeMarket(market);
    const cache_key = getHistoricalCacheKey(normalized_market, ticker);
    const cached = historical_price_cache.get(cache_key)?.get(date);

    if (cached !== undefined) {
      return cached;
    }

    const db_price = loadFromDb(normalized_market, ticker, date);
    if (db_price !== null) {
      if (!historical_price_cache.has(cache_key)) {
        historical_price_cache.set(cache_key, new Map());
      }
      historical_price_cache.get(cache_key)!.set(date, db_price);
      return db_price;
    }

    let price: number | null = null;

    if (normalized_market === 'us') {
      price = await fetchYahooHistoricalPrice(ticker, date);
    } else {
      price = await fetchTwHistoricalPrice(ticker, date);
    }

    if (price !== null) {
      if (!historical_price_cache.has(cache_key)) {
        historical_price_cache.set(cache_key, new Map());
      }
      historical_price_cache.get(cache_key)!.set(date, price);
      await saveToDb(normalized_market, ticker, date, price);
      return price;
    }

    return null;
  };

  return {
    fetchPricesBatch,
    fetchHistoricalPrice,
  };
}
