import { ref } from 'vue';

import { buildCorsProxyUrl } from '../utils/cors-proxy';
import { DEFAULT_MARKET, getMarketStorageKey, normalizeMarket, type Market } from '../utils/market';

const US_STOCK_SOURCES = [
  'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nasdaq/nasdaq_full_tickers.json',
  'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nyse/nyse_full_tickers.json',
  'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/amex/amex_full_tickers.json',
];

interface Stock {
  ticker: string;
  name: string;
  market: Market;
}

type SearchMarket = Market | '';

function collectStockEntries(raw_data: unknown): Array<{ ticker: string; name: string }> {
  const entries: Array<{ ticker: string; name: string }> = [];

  const pushEntry = (ticker: unknown, name: unknown): void => {
    const normalized_ticker = String(ticker || '')
      .trim()
      .toUpperCase();
    const normalized_name = String(name || normalized_ticker).trim();
    if (!normalized_ticker) return;
    entries.push({
      ticker: normalized_ticker,
      name: normalized_name,
    });
  };

  if (Array.isArray(raw_data)) {
    for (const item of raw_data as Array<Record<string, unknown>>) {
      pushEntry(item.symbol || item.ticker, item.name || item.title || item.description);
    }
    return entries;
  }

  if (raw_data && typeof raw_data === 'object') {
    const record = raw_data as Record<string, unknown>;

    if (Array.isArray(record.data) && Array.isArray(record.fields)) {
      const fields = record.fields.map(field => String(field).trim().toLowerCase());
      const ticker_index = fields.indexOf('ticker');
      const name_index = fields.indexOf('name');

      if (ticker_index >= 0 && name_index >= 0) {
        for (const row of record.data as unknown[][]) {
          pushEntry(row[ticker_index], row[name_index]);
        }
      }
      return entries;
    }

    for (const item of Object.values(record)) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      pushEntry(entry.symbol || entry.ticker, entry.name || entry.title || entry.description);
    }
  }

  return entries;
}

const stock_lists = ref<Record<Market, Stock[]>>({
  tw: [],
  us: [],
});
const loading_states = ref<Record<Market, boolean>>({
  tw: false,
  us: false,
});

export function useStockList() {
  const loadStockList = async (
    market: Market = DEFAULT_MARKET,
    force = false,
  ): Promise<Stock[]> => {
    const normalized_market = normalizeMarket(market);

    if (!force && stock_lists.value[normalized_market].length > 0) {
      return stock_lists.value[normalized_market];
    }

    if (loading_states.value[normalized_market]) {
      return [];
    }

    loading_states.value[normalized_market] = true;

    const cache_key = getMarketStorageKey('stock_list_cache', normalized_market);
    const legacy_key = normalized_market === 'tw' ? 'stock_list_cache' : '';
    const legacy_stored = legacy_key ? localStorage.getItem(legacy_key) : null;
    let stored = localStorage.getItem(cache_key);

    if (!stored && legacy_stored) {
      stored = legacy_stored;
      localStorage.setItem(cache_key, legacy_stored);
      localStorage.removeItem(legacy_key);
    }

    if (stored) {
      try {
        const cached_map = JSON.parse(stored) as Record<string, string>;
        const cached_list = Object.entries(cached_map)
          .map(([ticker, name]) => ({
            ticker,
            name,
            market: normalized_market,
          }))
          .sort((a, b) => a.ticker.localeCompare(b.ticker));

        if (cached_list.length > 0) {
          stock_lists.value[normalized_market] = cached_list;
          loading_states.value[normalized_market] = false;
          return stock_lists.value[normalized_market];
        }
      } catch {
        // continue to fetch
      }
    }

    try {
      if (normalized_market === 'tw') {
        const [stock_res, etf_res] = await Promise.all([
          fetch(buildCorsProxyUrl('https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_d')),
          fetch(buildCorsProxyUrl('https://openapi.twse.com.tw/v1/exchangeReport/TWT53U')),
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

        localStorage.setItem(cache_key, JSON.stringify(stock_map));
        stock_lists.value[normalized_market] = Object.entries(stock_map)
          .map(([ticker, name]) => ({
            ticker,
            name,
            market: normalized_market,
          }))
          .sort((a, b) => a.ticker.localeCompare(b.ticker));
      } else {
        const stock_map: Record<string, string> = {};

        for (const source_url of US_STOCK_SOURCES) {
          try {
            const response = await fetch(buildCorsProxyUrl(source_url));
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const entries = collectStockEntries(data);

            for (const entry of entries) {
              stock_map[entry.ticker] = entry.name;
            }
          } catch (e) {
            console.error(`Failed to fetch US stock list source ${source_url}:`, e);
          }
        }

        localStorage.setItem(cache_key, JSON.stringify(stock_map));
        stock_lists.value[normalized_market] = Object.entries(stock_map)
          .map(([ticker, name]) => ({
            ticker,
            name,
            market: normalized_market,
          }))
          .sort((a, b) => a.ticker.localeCompare(b.ticker));
      }
    } catch (e) {
      console.error(`Failed to fetch stock list for ${normalized_market}:`, e);
    }

    loading_states.value[normalized_market] = false;
    return stock_lists.value[normalized_market];
  };

  const addStock = async (stock: Stock): Promise<void> => {
    if (!stock.ticker) return;

    const market = normalizeMarket(stock.market);
    const exists = stock_lists.value[market].find(s => s.ticker === stock.ticker);
    if (!exists) {
      const cache_key = getMarketStorageKey('stock_list_cache', market);
      const legacy_key = market === 'tw' ? 'stock_list_cache' : '';
      const legacy_stored = legacy_key ? localStorage.getItem(legacy_key) : null;
      let stored = localStorage.getItem(cache_key);

      if (!stored && legacy_stored) {
        stored = legacy_stored;
        localStorage.setItem(cache_key, legacy_stored);
        localStorage.removeItem(legacy_key);
      }

      const stock_map = stored ? (JSON.parse(stored) as Record<string, string>) : {};

      stock_map[stock.ticker] = stock.name || '';
      localStorage.setItem(cache_key, JSON.stringify(stock_map));

      stock_lists.value[market].push({
        ticker: stock.ticker,
        name: stock.name || '',
        market,
      });
      stock_lists.value[market].sort((a, b) => a.ticker.localeCompare(b.ticker));
    }
  };

  const fetchYahooSearchStocks = async (query: string): Promise<Stock[]> => {
    const trimmed_query = query.trim();
    if (!trimmed_query) return [];

    try {
      const response = await fetch(
        buildCorsProxyUrl(
          `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(trimmed_query)}&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=false`,
        ),
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
      const results: Stock[] = [];
      const seen = new Set<string>();

      for (const item of quotes as Array<Record<string, unknown>>) {
        const ticker = String(item.symbol || '')
          .trim()
          .toUpperCase();
        const name = String(
          item.shortname || item.longname || item.longName || item.name || ticker,
        ).trim();
        const quote_type = String(item.quoteType || '')
          .trim()
          .toUpperCase();

        if (!ticker || seen.has(ticker)) continue;
        if (!['ETF', 'EQUITY', 'MUTUALFUND', 'INDEX'].includes(quote_type)) continue;

        seen.add(ticker);
        results.push({
          ticker,
          name,
          market: 'us',
        });
      }

      return results;
    } catch (e) {
      console.error('Failed to fetch Yahoo search stocks:', e);
      return [];
    }
  };

  const searchStocksWithFallback = async (
    query: string,
    market: SearchMarket = DEFAULT_MARKET,
  ): Promise<Stock[]> => {
    const normalized_market = market === '' ? '' : normalizeMarket(market);
    const local_results = searchStocks(query, normalized_market);
    if (local_results.length > 0 || (normalized_market !== '' && normalized_market !== 'us')) {
      return local_results;
    }

    const remote_results = await fetchYahooSearchStocks(query);
    for (const stock of remote_results) {
      await addStock(stock);
    }

    const merged_results = searchStocks(query, normalized_market);
    if (merged_results.length > 0) {
      return merged_results;
    }

    return remote_results;
  };

  const searchStocks = (query: string, market: SearchMarket = DEFAULT_MARKET): Stock[] => {
    if (!query || query.length < 1) return [];

    const q = query.toUpperCase();
    const list =
      market === ''
        ? [...stock_lists.value.tw, ...stock_lists.value.us]
        : (stock_lists.value[normalizeMarket(market)] ?? []);

    const results = list.filter(s => {
      const ticker_match = s.ticker.toUpperCase().includes(q);
      const name_match = s.name.includes(query) || s.name.toUpperCase().includes(q);
      return ticker_match || name_match;
    });

    results.sort((a, b) => {
      const a_starts = a.ticker.toUpperCase().startsWith(q) || a.name.startsWith(query);
      const b_starts = b.ticker.toUpperCase().startsWith(q) || b.name.startsWith(query);
      if (a_starts && !b_starts) return -1;
      if (!a_starts && b_starts) return 1;
      return a.ticker.localeCompare(b.ticker);
    });

    return results.slice(0, 15);
  };

  return {
    stock_lists,
    loading_states,
    loadStockList,
    addStock,
    searchStocks,
    searchStocksWithFallback,
  };
}
