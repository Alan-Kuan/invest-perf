import { ref } from 'vue';

import { useDatabase } from './useDatabase';

export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  total_cost: number;
  curr_price?: number;
  total_value?: number;
  unrealized_gain?: number;
  unrealized_roi?: number;
}

interface PriceData {
  [ticker: string]: number;
}

export interface PortfolioSummary {
  holdings: Holding[];
  total_cost: number;
  total_value: number;
  realized_gain: number;
  unrealized_gain: number;
}

export function usePortfolio() {
  const { query } = useDatabase();
  const holdings = ref<Holding[]>([]);
  const prices = ref<PriceData>({});
  const realized_gain_cache = ref<number>(0);

  const loadCurrPrices = (): PriceData => {
    const stored = localStorage.getItem('curr_prices_cache');
    if (stored) {
      try {
        prices.value = JSON.parse(stored);
      } catch {
        prices.value = {};
      }
    }
    return prices.value;
  };

  const updateCurrPricesCache = (new_prices: PriceData): void => {
    prices.value = { ...prices.value, ...new_prices };
    localStorage.setItem('curr_prices_cache', JSON.stringify(prices.value));
  };

  const loadHoldings = () => {
    const sql = `SELECT * FROM transactions ORDER BY date, id`;
    const txs = query(sql) as any[];

    const state: Record<string, { shares: number; cost: number; name: string }> = {};
    let total_realized = 0;

    for (const tx of txs) {
      if (!state[tx.ticker]) {
        state[tx.ticker] = { shares: 0, cost: 0, name: tx.name };
      }
      const h = state[tx.ticker];

      if (tx.type === 'buy') {
        h.shares += tx.shares;
        h.cost += tx.net_amount;
      } else if (tx.type === 'sell') {
        const avg_cost = h.shares > 0 ? h.cost / h.shares : 0;
        const cost_basis = tx.shares * avg_cost;
        total_realized += tx.net_amount - cost_basis;
        h.shares -= tx.shares;
        h.cost -= cost_basis;
      }
    }

    realized_gain_cache.value = total_realized;

    holdings.value = Object.entries(state)
      .filter(([_, h]) => h.shares > 0)
      .map(([ticker, h]) => ({
        ticker,
        name: h.name,
        shares: h.shares,
        total_cost: h.cost,
      }));

    for (const h of holdings.value) {
      if (!prices.value[h.ticker]) continue;

      const is_etf = h.ticker.startsWith('00');
      const fee_rate = 0.001425;
      const tax_rate = is_etf ? 0.001 : 0.003;

      h.curr_price = prices.value[h.ticker];
      h.total_value = h.curr_price * h.shares;
      h.unrealized_gain = Math.round(h.total_value * (1 - fee_rate - tax_rate) - h.total_cost);
      h.unrealized_roi = (h.unrealized_gain / h.total_cost) * 100;
    }
  };

  const getPortfolioSummary = (): PortfolioSummary => {
    loadCurrPrices();
    loadHoldings();

    return {
      holdings: holdings.value,
      total_cost: holdings.value.reduce((sum, h) => sum + h.total_cost, 0),
      total_value: holdings.value.reduce((sum, h) => sum + (h.total_value ?? 0), 0),
      realized_gain: realized_gain_cache.value,
      unrealized_gain: holdings.value.reduce((sum, h) => sum + (h.unrealized_gain ?? 0), 0),
    };
  };

  return {
    holdings,
    prices,
    updateCurrPricesCache,
    getPortfolioSummary,
  };
}
