import { ref } from 'vue';

import { DEFAULT_MARKET, getMarketStorageKey, normalizeMarket, type Market } from '../utils/market';
import { useDatabase } from './useDatabase';

export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  total_cost: number;
  market: Market;
  curr_price?: number;
  total_value?: number;
  unrealized_gain?: number;
  unrealized_roi?: number;
}

interface PriceData {
  [ticker: string]: number;
}

export interface PortfolioSummary {
  market: Market;
  holdings: Holding[];
  total_cost: number;
  total_value: number;
  realized_gain: number;
  unrealized_gain: number;
}

export function usePortfolio() {
  const { query } = useDatabase();
  const holdings = ref<Holding[]>([]);
  const prices = ref<Record<Market, PriceData>>({
    tw: {},
    us: {},
  });

  const loadCurrPrices = (market: Market): PriceData => {
    const normalized_market = normalizeMarket(market);
    const market_key = getMarketStorageKey('curr_prices_cache', normalized_market);
    const legacy_key = normalized_market === 'tw' ? 'curr_prices_cache' : '';
    const legacy_stored = legacy_key ? localStorage.getItem(legacy_key) : null;
    let stored = localStorage.getItem(market_key);

    if (!stored && legacy_stored) {
      stored = legacy_stored;
      localStorage.setItem(market_key, legacy_stored);
      localStorage.removeItem(legacy_key);
    }

    if (stored) {
      try {
        prices.value[normalized_market] = JSON.parse(stored) as PriceData;
      } catch {
        prices.value[normalized_market] = {};
      }
    } else {
      prices.value[normalized_market] = {};
    }

    return prices.value[normalized_market];
  };

  const updateCurrPricesCache = (market: Market, new_prices: PriceData): void => {
    const normalized_market = normalizeMarket(market);
    prices.value[normalized_market] = {
      ...prices.value[normalized_market],
      ...new_prices,
    };

    const market_key = getMarketStorageKey('curr_prices_cache', normalized_market);
    localStorage.setItem(market_key, JSON.stringify(prices.value[normalized_market]));
  };

  const getSaleCostRate = (market: Market, ticker: string): number => {
    if (market === 'us') {
      return 1;
    }

    const fee_rate = 0.001425;
    const tax_rate = ticker.startsWith('00') ? 0.001 : 0.003;
    return 1 - fee_rate - tax_rate;
  };

  const loadHoldings = (market: Market) => {
    const normalized_market = normalizeMarket(market);
    const txs = query(
      `SELECT * FROM transactions WHERE market = ? ORDER BY date ASC, created_at ASC, id ASC`,
      [normalized_market],
    ) as any[];

    const state: Record<string, { shares: number; cost: number; name: string }> = {};
    let total_realized = 0;

    for (const tx of txs) {
      if (!state[tx.ticker]) {
        state[tx.ticker] = { shares: 0, cost: 0, name: tx.name };
      }
      const holding = state[tx.ticker];

      if (tx.type === 'buy') {
        holding.shares += tx.shares;
        holding.cost += tx.net_amount;
      } else if (tx.type === 'sell') {
        const avg_cost = holding.shares > 0 ? holding.cost / holding.shares : 0;
        const cost_basis = tx.shares * avg_cost;
        total_realized += tx.net_amount - cost_basis;
        holding.shares -= tx.shares;
        holding.cost -= cost_basis;
      }
    }

    const holdings: Holding[] = Object.entries(state)
      .filter(([, holding]) => holding.shares > 0)
      .map(([ticker, holding]) => ({
        ticker,
        name: holding.name,
        shares: holding.shares,
        total_cost: holding.cost,
        market: normalized_market,
      }));

    for (const holding of holdings) {
      const current_price = prices.value[normalized_market][holding.ticker];
      if (!current_price) continue;

      const sale_cost_rate = getSaleCostRate(normalized_market, holding.ticker);
      holding.curr_price = current_price;
      holding.total_value = current_price * holding.shares;
      const unrealized_gain = holding.total_value * sale_cost_rate - holding.total_cost;
      holding.unrealized_gain =
        normalized_market === 'us'
          ? Math.round(unrealized_gain * 100) / 100
          : Math.round(unrealized_gain);
      holding.unrealized_roi =
        holding.total_cost > 0 ? (holding.unrealized_gain / holding.total_cost) * 100 : 0;
    }

    return {
      holdings,
      total_realized,
    };
  };

  const getPortfolioSummary = (market: Market = DEFAULT_MARKET): PortfolioSummary => {
    const normalized_market = normalizeMarket(market);
    loadCurrPrices(normalized_market);
    const { holdings: market_holdings, total_realized } = loadHoldings(normalized_market);
    holdings.value = market_holdings;

    return {
      market: normalized_market,
      holdings: market_holdings,
      total_cost: market_holdings.reduce((sum, holding) => sum + holding.total_cost, 0),
      total_value: market_holdings.reduce((sum, holding) => sum + (holding.total_value ?? 0), 0),
      realized_gain: total_realized,
      unrealized_gain: market_holdings.reduce(
        (sum, holding) => sum + (holding.unrealized_gain ?? 0),
        0,
      ),
    };
  };

  return {
    holdings,
    prices,
    updateCurrPricesCache,
    getPortfolioSummary,
  };
}
