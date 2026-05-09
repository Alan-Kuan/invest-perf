import { buildCorsProxyUrl } from '../utils/cors-proxy';
import { DEFAULT_MARKET, normalizeMarket, type Market } from '../utils/market';
import { useDatabase } from './useDatabase';

const historical_price_cache = new Map<string, Map<string, number>>();

let last_yahoo_request_time = 0;
let yahoo_request_queue: Promise<unknown> = Promise.resolve();
const MIN_REQUEST_INTERVAL = 500; // allow up to 2 Yahoo API requests per second
const MARKET_HOURS_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes during market hours
const AFTER_HOURS_UPDATE_INTERVAL = 8 * 60 * 60 * 1000; // 8 hours after market hours

function loadCurrentPriceCache(market: Market): Record<string, number> {
  const normalized_market = normalizeMarket(market);
  const cache_key = `curr_prices_cache_${normalized_market}`;
  const legacy_key = normalized_market === 'tw' ? 'curr_prices_cache' : '';
  const stored =
    localStorage.getItem(cache_key) || (legacy_key ? localStorage.getItem(legacy_key) : null);
  if (!stored) return {};

  try {
    return JSON.parse(stored) as Record<string, number>;
  } catch {
    return {};
  }
}

export function loadCurrentPriceTimestamps(market: Market): number | null {
  const normalized_market = normalizeMarket(market);
  const timestamp_key = `curr_prices_cache_timestamps_${normalized_market}`;
  const stored = localStorage.getItem(timestamp_key);
  if (!stored) return null;

  return parseInt(stored, 10) || null;
}

type PriceData = Record<string, number>;

function updateCurrPricesCache(new_prices: PriceData, market: Market): void {
  const normalized_market = normalizeMarket(market);
  const cache_key = `curr_prices_cache_${normalized_market}`;
  const timestamp_key = `curr_prices_cache_timestamps_${normalized_market}`;

  const previous_cache = loadCurrentPriceCache(normalized_market);
  const merged_cache = {
    ...previous_cache,
    ...new_prices,
  };

  localStorage.setItem(cache_key, JSON.stringify(merged_cache));
  localStorage.setItem(timestamp_key, Date.now().toString());
}

function isCurrentPriceCacheExpired(market: Market, timestamp: number): boolean {
  const now = Date.now();
  const interval = isMarketHours(market)
    ? MARKET_HOURS_UPDATE_INTERVAL
    : AFTER_HOURS_UPDATE_INTERVAL;
  return now - timestamp > interval;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isMarketHours(market: Market): boolean {
  const time_zone = market === 'us' ? 'America/New_York' : 'Asia/Taipei';
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: time_zone,
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);

  const weekday = parts.find(part => part.type === 'weekday')?.value || '';
  const hour = parseInt(parts.find(part => part.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(part => part.type === 'minute')?.value || '0', 10);
  const time_in_minutes = hour * 60 + minute;

  if (weekday === 'Sat' || weekday === 'Sun') return false;

  if (market === 'us') {
    return time_in_minutes >= 9 * 60 + 30 && time_in_minutes <= 16 * 60;
  }

  return time_in_minutes >= 9 * 60 && time_in_minutes <= 13 * 60 + 30;
}

function toYahooSymbol(ticker: string, market?: Market): string {
  const symbol = ticker.trim().toUpperCase();
  if (market === 'tw') {
    if (symbol.includes('.')) {
      return symbol;
    }
    return `${symbol}.TW`;
  }
  return symbol.replace(/\./g, '-');
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

  const getCurrPrice = async (
    ticker: string,
    market: Market = DEFAULT_MARKET,
    force = false,
  ): Promise<number | null> => {
    const normalized_market = normalizeMarket(market);
    const cache_prices = loadCurrentPriceCache(normalized_market);
    const last_cached = loadCurrentPriceTimestamps(normalized_market);

    if (
      !force &&
      typeof cache_prices[ticker] === 'number' &&
      last_cached !== null &&
      !isCurrentPriceCacheExpired(normalized_market, last_cached)
    ) {
      return cache_prices[ticker];
    }

    const yahoo_symbol = toYahooSymbol(ticker, normalized_market);
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
      console.error(`Failed to fetch current price for ${ticker}:`, e);
    }

    return null;
  };

  const getCurrPriceBatch = async (
    tickers: string[],
    market: Market = DEFAULT_MARKET,
    force = false,
  ): Promise<Record<string, number>> => {
    if (tickers.length === 0) return {};

    const normalized_market = normalizeMarket(market);

    try {
      const prices: Record<string, number> = {};

      for (const ticker of tickers) {
        const price = await getCurrPrice(ticker, normalized_market, force);
        if (price !== null) {
          prices[ticker] = price;
        }
      }

      if (Object.keys(prices).length > 0) {
        updateCurrPricesCache(prices, normalized_market);
      }

      return prices;
    } catch (e) {
      console.error('Batch fetch failed:', e);
      return {};
    }
  };

  const fetchHistoricalPriceRemote = async (
    ticker: string,
    date: string,
    market: Market = DEFAULT_MARKET,
  ): Promise<number | null> => {
    const start_date = new Date(`${date}T00:00:00`);
    start_date.setDate(start_date.getDate() - 10);
    const end_date = new Date(`${date}T00:00:00`);
    end_date.setDate(end_date.getDate() + 1);

    const chart_url = buildCorsProxyUrl(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(toYahooSymbol(ticker, market))}?period1=${Math.floor(start_date.getTime() / 1000)}&period2=${Math.floor(end_date.getTime() / 1000)}&interval=1d&includePrePost=false&events=div,splits`,
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
      console.error(`Failed to fetch historical price for ${ticker} on ${date}:`, e);
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

    const price = await fetchHistoricalPriceRemote(ticker, date, normalized_market);

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
    getCurrPriceBatch,
    fetchHistoricalPrice,
  };
}
