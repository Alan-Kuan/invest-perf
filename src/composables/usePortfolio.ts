import { ref } from 'vue';

import { useDatabase } from './useDatabase';

export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  avg_cost: number;
  total_cost: number;
  current_price?: number;
  unrealized_gain?: number;
  unrealized_gain_percent?: number;
}

interface PriceData {
  [ticker: string]: number;
}

export function usePortfolio() {
  const { query } = useDatabase();
  const holdings = ref<Holding[]>([]);
  const prices = ref<PriceData>({});

  const loadHoldings = (): Holding[] => {
    const sql = `
      SELECT
        ticker,
        name,
        SUM(CASE WHEN type = 'buy' THEN shares ELSE -shares END) as shares,
        SUM(CASE WHEN type = 'buy' THEN total + fee ELSE -(total - fee - tax) END) /
          NULLIF(SUM(CASE WHEN type = 'buy' THEN shares ELSE -shares END), 0) as avg_cost,
        SUM(CASE WHEN type = 'buy' THEN total + fee ELSE -(total - fee - tax) END) as total_cost
      FROM transactions
      GROUP BY ticker
      HAVING shares > 0
      ORDER BY ticker
    `;

    holdings.value = query(sql) as unknown as Holding[];

    holdings.value.forEach(h => {
      if (prices.value[h.ticker]) {
        h.current_price = prices.value[h.ticker];
        h.unrealized_gain = (h.current_price - h.avg_cost) * h.shares;
        h.unrealized_gain_percent = (h.current_price / h.avg_cost - 1) * 100;
      }
    });

    return holdings.value;
  };

  const loadPrices = (): PriceData => {
    const stored = localStorage.getItem('stock_prices_cache');
    if (stored) {
      try {
        prices.value = JSON.parse(stored);
      } catch {
        prices.value = {};
      }
    }

    holdings.value.forEach(h => {
      if (prices.value[h.ticker]) {
        h.current_price = prices.value[h.ticker];
        h.unrealized_gain = (h.current_price - h.avg_cost) * h.shares;
        h.unrealized_gain_percent = (h.current_price / h.avg_cost - 1) * 100;
      }
    });

    return prices.value;
  };

  const updatePrice = (ticker: string, price: number): void => {
    prices.value[ticker] = price;
    localStorage.setItem('stock_prices_cache', JSON.stringify(prices.value));
    loadHoldings();
  };

  const getRealizedGain = (): number => {
    const sql = `
      SELECT
        ticker,
        SUM(CASE WHEN type = 'sell' THEN total - fee - tax ELSE 0 END) -
        SUM(CASE WHEN type = 'sell' THEN shares * avg_cost ELSE 0 END) as realized_gain
      FROM (
        SELECT
          t.ticker,
          t.type,
          t.total,
          t.fee,
          t.tax,
          t.shares,
          (SELECT SUM(CASE WHEN type = 'buy' THEN total + fee ELSE -(total - fee - tax) END) /
                     NULLIF(SUM(CASE WHEN type = 'buy' THEN shares ELSE -shares END), 0)
           FROM transactions t2
           WHERE t2.ticker = t.ticker AND t2.date <= t.date AND t2.type = 'buy')
           as avg_cost
        FROM transactions t
        WHERE type = 'sell'
      )
      GROUP BY ticker
    `;

    const result = query(sql) as { realized_gain: number }[];
    return result.reduce((sum, r) => sum + (r.realized_gain || 0), 0);
  };

  const getPortfolioSummary = () => {
    loadHoldings();
    loadPrices();

    const total_cost = holdings.value.reduce((sum, h) => sum + h.total_cost, 0);
    const total_value = holdings.value.reduce(
      (sum, h) => sum + (h.current_price || h.avg_cost) * h.shares,
      0,
    );
    const total_unrealized = holdings.value.reduce((sum, h) => sum + (h.unrealized_gain || 0), 0);
    const realized_gain = getRealizedGain();

    return {
      holdings: holdings.value,
      total_cost,
      total_value,
      total_unrealized,
      total_gain: total_unrealized + realized_gain,
      realized_gain,
    };
  };

  return {
    holdings,
    prices,
    loadHoldings,
    loadPrices,
    updatePrice,
    getRealizedGain,
    getPortfolioSummary,
  };
}
