import { ref } from 'vue';

import { useDatabase } from './useDatabase';

export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  avg_cost: number;
  total_cost: number;
  currentPrice?: number;
  unrealizedGain?: number;
  unrealizedGainPercent?: number;
}

interface PriceData {
  [ticker: string]: number;
}

export function usePortfolio() {
  const { query, execute } = useDatabase();
  const holdings = ref<Holding[]>([]);
  const prices = ref<PriceData>({});

  function loadHoldings(): Holding[] {
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
        h.currentPrice = prices.value[h.ticker];
        h.unrealizedGain = (h.currentPrice - h.avg_cost) * h.shares;
        h.unrealizedGainPercent = (h.currentPrice / h.avg_cost - 1) * 100;
      }
    });

    return holdings.value;
  }

  function loadPrices(): PriceData {
    const priceData = query('SELECT * FROM prices') as { ticker: string; price: number }[];
    priceData.forEach(p => {
      prices.value[p.ticker] = p.price;
    });

    holdings.value.forEach(h => {
      if (prices.value[h.ticker]) {
        h.currentPrice = prices.value[h.ticker];
        h.unrealizedGain = (h.currentPrice - h.avg_cost) * h.shares;
        h.unrealizedGainPercent = (h.currentPrice / h.avg_cost - 1) * 100;
      }
    });

    return prices.value;
  }

  function updatePrice(ticker: string, price: number): void {
    execute(
      `INSERT OR REPLACE INTO prices (ticker, price, updated_at) VALUES (?, ?, datetime('now'))`,
      [ticker, price],
    );
    prices.value[ticker] = price;
    loadHoldings();
  }

  function getRealizedGain(): number {
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
  }

  function getPortfolioSummary() {
    loadHoldings();
    loadPrices();

    const totalCost = holdings.value.reduce((sum, h) => sum + h.total_cost, 0);
    const totalValue = holdings.value.reduce(
      (sum, h) => sum + (h.currentPrice || h.avg_cost) * h.shares,
      0,
    );
    const totalUnrealized = holdings.value.reduce((sum, h) => sum + (h.unrealizedGain || 0), 0);
    const realizedGain = getRealizedGain();

    return {
      holdings: holdings.value,
      totalCost,
      totalValue,
      totalUnrealized,
      totalGain: totalUnrealized + realizedGain,
      realizedGain,
    };
  }

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
