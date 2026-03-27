interface PriceCache {
  price: number;
  timestamp: number;
}

const priceCache = new Map<string, PriceCache>();
const CACHE_DURATION = 60000;

export function useStockPrice() {
  const fetchPrice = async (ticker: string): Promise<number | null> => {
    const now = Date.now();
    const cached = priceCache.get(ticker);

    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return cached.price;
    }

    try {
      const market = ticker.startsWith('00') ? 'tse' : 'tse';
      const response = await fetch(
        `/api/mis/stock/api/getStockInfo.jsp?ex_ch=${market}_${ticker}.tw&json=1&delay=0`
      );
      const data = await response.json();

      if (data.msgArray && data.msgArray.length > 0) {
        const price = parseFloat(data.msgArray[0].z);
        if (!isNaN(price)) {
          priceCache.set(ticker, { price, timestamp: now });
          return price;
        }
      }
    } catch (e) {
      console.error(`Failed to fetch price for ${ticker}:`, e);
    }

    return null;
  };

  const fetchPrices = async (tickers: string[]): Promise<Record<string, number>> => {
    const uncachedTickers: string[] = [];
    const now = Date.now();
    const prices: Record<string, number> = {};

    for (const ticker of tickers) {
      const cached = priceCache.get(ticker);
      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        prices[ticker] = cached.price;
      } else {
        uncachedTickers.push(ticker);
      }
    }

    if (uncachedTickers.length > 0) {
      const fetchedPrices = await fetchPricesBatch(uncachedTickers);
      Object.assign(prices, fetchedPrices);
    }

    return prices;
  };

  const fetchPricesBatch = async (tickers: string[]): Promise<Record<string, number>> => {
    if (tickers.length === 0) return {};

    try {
      const market = 'tse';
      const codes = tickers.map(t => `${market}_${t}.tw`).join('|');
      const url = `/api/mis/stock/api/getStockInfo.jsp?ex_ch=${codes}&json=1&delay=0`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();

      if (!text || text.trim() === '') {
        console.warn('Empty response from stock API');
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
            priceCache.set(code, { price, timestamp: Date.now() });
          }
        }
      }
      return prices;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        console.error('Stock API timeout');
      } else {
        console.error('Batch fetch failed:', e);
      }
      return {};
    }
  };

  return {
    fetchPrice,
    fetchPrices,
    fetchPricesBatch
  };
}
