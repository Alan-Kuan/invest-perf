<script setup lang="ts">
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import katex from 'katex';
import { ref, watch } from 'vue';
import { Bar, Line } from 'vue-chartjs';

import { useDatabase } from '../composables/useDatabase';
import { usePortfolio } from '../composables/usePortfolio';
import { useStockPrice } from '../composables/useStockPrice';
import { MARKET_OPTIONS, type Market } from '../utils/market';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

const { is_ready, query } = useDatabase();
const { getPortfolioSummary, updateCurrPricesCache } = usePortfolio();
const { fetchHistoricalPrice, fetchPricesBatch } = useStockPrice();

const is_loading = ref(false);
const is_loading_market = ref<Record<Market, boolean>>({
  tw: false,
  us: false,
});

interface PerformanceStats {
  realized_gain: number;
  unrealized_gain: number;
  total_dividend: number;
  total_return: number;
  buy_count: number;
  sell_count: number;
  win_count: number;
  lose_count: number;
}

interface AnnualData {
  year: number;
  realized_return_rate: number;
  unrealized_return_rate: number;
  total_return_rate: number;
  total_gain: number;
}

const stats = ref<Record<Market, PerformanceStats>>({
  tw: createEmptyStats(),
  us: createEmptyStats(),
});

const annual_performance = ref<Record<Market, AnnualData[]>>({
  tw: [],
  us: [],
});

const performance_formula_items = [
  {
    label: '年度報酬率計算方式',
    lines: [
      '\\text{加權投入資本} = \\text{年初部位淨值} + \\sum (\\text{買入金額} \\times \\text{剩餘年度權重}) - \\sum (\\text{賣出金額} \\times \\text{剩餘年度權重})',
      '\\text{年末持股淨值} = \\sum (\\text{年末收盤價} \\times \\text{剩餘持股}) \\times (1 - \\text{手續費率} - \\text{交易稅率})',
      '\\text{已實現報酬率} = \\dfrac{\\text{已實現損益} + \\text{股利收入}}{\\text{加權投入資本}} \\times 100\\%',
      '\\text{未實現報酬率} = \\dfrac{\\text{年末持股淨值} - \\text{年末剩餘成本}}{\\text{加權投入資本}} \\times 100\\%',
      '\\text{總報酬率} = \\dfrac{\\text{已實現損益} + \\text{股利收入} + \\text{未實現損益}}{\\text{加權投入資本}} \\times 100\\%',
    ],
    notes: [
      '採用現金流加權的年度報酬率，接近 Modified Dietz 的年度算法',
      '購買手續費會記入成本，賣出手續費和交易稅會從收入與年末淨值扣除',
      '剩餘股票以當年年末估算淨值結轉到隔年繼續計算',
    ],
  },
  {
    label: '年度累積損益計算方式',
    lines: [],
    notes: ['顯示每一年結束時的累積損益金額'],
  },
] as const;

interface YearlyHolding {
  shares: number;
  carry_cost: number;
}

function createEmptyStats(): PerformanceStats {
  return {
    realized_gain: 0,
    unrealized_gain: 0,
    total_dividend: 0,
    total_return: 0,
    buy_count: 0,
    sell_count: 0,
    win_count: 0,
    lose_count: 0,
  };
}

function getSaleCostRate(market: Market, ticker: string): number {
  const fee_rate = 0.001425;
  const tax_rate = market === 'tw' ? (ticker.startsWith('00') ? 0.001 : 0.003) : 0;
  return 1 - fee_rate - tax_rate;
}

function getYearBounds(
  year: number,
  current_year: number,
): {
  start_date: string;
  end_date: string;
} {
  const start_date = `${year}-01-01`;
  const end_date = year === current_year ? new Date().toISOString().split('T')[0] : `${year}-12-31`;
  return { start_date, end_date };
}

function getRemainingWeight(date: string, start_date: string, end_date: string): number {
  const tx_time = new Date(`${date}T00:00:00`).getTime();
  const start_time = new Date(`${start_date}T00:00:00`).getTime();
  const end_time = new Date(`${end_date}T00:00:00`).getTime();
  const total_days = Math.max(1, Math.floor((end_time - start_time) / 86400000) + 1);
  const elapsed_days = Math.max(
    0,
    Math.min(total_days - 1, Math.floor((tx_time - start_time) / 86400000)),
  );

  return (total_days - elapsed_days) / total_days;
}

function groupTransactionsByYear(transactions: any[]): Record<number, any[]> {
  const grouped: Record<number, any[]> = {};

  for (const transaction of transactions) {
    const year = parseInt(transaction.date.substring(0, 4));
    if (!grouped[year]) {
      grouped[year] = [];
    }
    grouped[year].push(transaction);
  }

  return grouped;
}

function groupDividendsByYear(dividends: any[]): Record<number, number> {
  const grouped: Record<number, number> = {};

  for (const dividend of dividends) {
    const year = parseInt(dividend.pay_date.substring(0, 4));
    if (!grouped[year]) {
      grouped[year] = 0;
    }
    grouped[year] += dividend.amount;
  }

  return grouped;
}

function getPerformanceChartData(market: Market): any {
  const data = annual_performance.value[market];
  return {
    labels: data.map(item => item.year),
    datasets: [
      {
        label: '總報酬率',
        data: data.map(item => item.total_return_rate * 100),
        type: 'line' as const,
        borderColor: '#16448c',
        backgroundColor: 'transparent',
        pointBackgroundColor: '#16448c',
        tension: 0.3,
        order: 1,
      },
      {
        label: '已實現報酬率',
        data: data.map(item => item.realized_return_rate * 100),
        backgroundColor: '#2196f3',
        borderRadius: 4,
        barPercentage: 0.6,
        stack: `return_rate_${market}`,
        order: 2,
      },
      {
        label: '未實現報酬率',
        data: data.map(item => item.unrealized_return_rate * 100),
        backgroundColor: '#87cefa',
        borderRadius: 4,
        barPercentage: 0.6,
        stack: `return_rate_${market}`,
        order: 2,
      },
    ],
  };
}

function getCumulativeChartData(market: Market) {
  const data = annual_performance.value[market];
  const cumulative_data: number[] = [];
  let running_total = 0;

  for (const item of data) {
    running_total += item.total_gain;
    cumulative_data.push(running_total);
  }

  return {
    labels: data.map(item => item.year),
    datasets: [
      {
        label: '累積損益',
        data: cumulative_data,
        borderColor: '#9c27b0',
        backgroundColor: 'rgba(156, 39, 176, 0.1)',
        fill: true,
        tension: 0.3,
      },
    ],
  };
}

function getPerformanceChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => [`${context.dataset.label}: ${context.raw?.toFixed(2)}%`],
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        stacked: true,
      },
      y: {
        stacked: true,
        ticks: {
          callback: (value: number | string) => Number(value).toFixed(1) + '%',
        },
      },
    },
  };
}

function getCumulativeChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const value = context.raw ?? 0;
            const prefix = value >= 0 ? '+' : '';
            return [`${context.dataset.label}: ${prefix}${Number(value).toLocaleString()}`];
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
      },
      y: {
        ticks: {
          callback: (value: number | string) => {
            const v = Number(value);
            return v >= 0 ? '+' + v.toLocaleString() : v.toLocaleString();
          },
        },
      },
    },
  };
}

async function loadAnnualPerformanceForMarket(market: Market): Promise<void> {
  const transactions = query(
    'SELECT * FROM transactions WHERE market = ? ORDER BY date ASC, created_at ASC, id ASC',
    [market],
  ) as any[];
  const dividends = query(
    'SELECT * FROM dividends WHERE market = ? ORDER BY pay_date ASC, created_at ASC, id ASC',
    [market],
  ) as any[];

  if (transactions.length === 0) {
    annual_performance.value[market] = [];
    return;
  }

  const first_year = parseInt(transactions[0].date.substring(0, 4));
  const current_year = new Date().getFullYear();
  const transactions_by_year = groupTransactionsByYear(transactions);
  const dividends_by_year = groupDividendsByYear(dividends);
  const annual_data_list: AnnualData[] = [];
  const carry_holdings = new Map<string, YearlyHolding>();

  for (let year = first_year; year <= current_year; year++) {
    const { start_date, end_date } = getYearBounds(year, current_year);
    const yearly_transactions = transactions_by_year[year] ?? [];
    const dividend_income = dividends_by_year[year] ?? 0;

    if (yearly_transactions.length === 0 && carry_holdings.size === 0 && dividend_income === 0) {
      annual_data_list.push({
        year,
        realized_return_rate: 0,
        unrealized_return_rate: 0,
        total_return_rate: 0,
        total_gain: 0,
      });
      continue;
    }

    let beginning_value = 0;
    let total_realized_gain = 0;
    let total_unrealized_gain = 0;
    let weighted_cash_flow = 0;

    for (const holding of carry_holdings.values()) {
      beginning_value += holding.carry_cost;
    }

    for (const transaction of yearly_transactions) {
      if (!carry_holdings.has(transaction.ticker)) {
        carry_holdings.set(transaction.ticker, {
          shares: 0,
          carry_cost: 0,
        });
      }

      const holding = carry_holdings.get(transaction.ticker)!;
      const weight = getRemainingWeight(transaction.date, start_date, end_date);

      if (transaction.type === 'buy') {
        holding.shares += transaction.shares;
        holding.carry_cost += transaction.net_amount;
        weighted_cash_flow += transaction.net_amount * weight;
        continue;
      }

      const avg_cost = holding.shares > 0 ? holding.carry_cost / holding.shares : 0;
      const cost_basis = transaction.shares * avg_cost;

      total_realized_gain += transaction.net_amount - cost_basis;
      holding.shares -= transaction.shares;
      holding.carry_cost -= cost_basis;
      weighted_cash_flow -= transaction.net_amount * weight;

      if (holding.shares <= 0) {
        carry_holdings.delete(transaction.ticker);
      }
    }

    for (const [ticker, holding] of carry_holdings) {
      if (holding.shares <= 0) continue;

      const end_price = (await fetchHistoricalPrice(ticker, end_date, market)) || 0;
      const end_value = holding.shares * end_price * getSaleCostRate(market, ticker);

      total_unrealized_gain += end_value - holding.carry_cost;
      holding.carry_cost = end_value;
    }

    const invested_capital = beginning_value + weighted_cash_flow;
    const realized_component = total_realized_gain + dividend_income;
    const total_gain = realized_component + total_unrealized_gain;

    annual_data_list.push({
      year,
      realized_return_rate: invested_capital > 0 ? realized_component / invested_capital : 0,
      unrealized_return_rate: invested_capital > 0 ? total_unrealized_gain / invested_capital : 0,
      total_return_rate: invested_capital > 0 ? total_gain / invested_capital : 0,
      total_gain,
    });
  }

  annual_performance.value[market] = annual_data_list;
  saveAnnualPerformanceCache(market, annual_data_list);
}

interface AnnualDataCache {
  data: AnnualData[];
  calculated_at: string;
}

function getAnnualPerformanceCacheKey(market: Market): string {
  return `annual_performance_cache_${market}`;
}

function saveAnnualPerformanceCache(market: Market, data: AnnualData[]): void {
  const cache: AnnualDataCache = {
    data,
    calculated_at: new Date().toISOString().split('T')[0],
  };
  localStorage.setItem(getAnnualPerformanceCacheKey(market), JSON.stringify(cache));
}

async function checkAndRecalculate(market: Market): Promise<void> {
  const cache_key = getAnnualPerformanceCacheKey(market);
  const stored = localStorage.getItem(cache_key);
  const legacy_key = 'annual_performance_cache';
  const legacy_stored = market === 'tw' ? localStorage.getItem(legacy_key) : null;

  if (legacy_stored) {
    if (!stored) {
      localStorage.setItem(cache_key, legacy_stored);
    }
    localStorage.removeItem(legacy_key);
  }

  const cached =
    stored || legacy_stored ? (JSON.parse(stored || legacy_stored!) as AnnualDataCache) : null;

  const latest_transaction = query(
    'SELECT MAX(date) as max_date FROM transactions WHERE market = ?',
    [market],
  ) as { max_date: string }[];
  const latest_dividend = query(
    'SELECT MAX(pay_date) as max_date FROM dividends WHERE market = ?',
    [market],
  ) as { max_date: string }[];

  const latest_data_date = latest_transaction[0]?.max_date || '';
  const latest_dividend_date = latest_dividend[0]?.max_date || '';

  if (!cached) {
    await loadAnnualPerformanceForMarket(market);
    return;
  }

  if (latest_data_date > cached.calculated_at || latest_dividend_date > cached.calculated_at) {
    await loadAnnualPerformanceForMarket(market);
    return;
  }

  annual_performance.value[market] = cached.data;
}

async function loadStatsForMarket(market: Market): Promise<void> {
  let summary = getPortfolioSummary(market);
  if (summary.holdings.length > 0) {
    const current_prices = await fetchPricesBatch(
      summary.holdings.map(holding => holding.ticker),
      market,
    );
    updateCurrPricesCache(market, current_prices);
    summary = getPortfolioSummary(market);
  }

  const dividends = query(
    'SELECT * FROM dividends WHERE market = ? ORDER BY pay_date ASC, created_at ASC, id ASC',
    [market],
  ) as any[];
  const total_dividend = dividends.reduce((sum, dividend) => sum + dividend.amount, 0);
  const buy_count_result = query(
    'SELECT COUNT(*) as count FROM transactions WHERE market = ? AND type = ?',
    [market, 'buy'],
  )[0]?.count;
  const sell_count_result = query(
    'SELECT COUNT(*) as count FROM transactions WHERE market = ? AND type = ?',
    [market, 'sell'],
  )[0]?.count;

  stats.value[market] = {
    realized_gain: summary.realized_gain,
    unrealized_gain: summary.unrealized_gain,
    total_dividend,
    total_return: summary.realized_gain + total_dividend + summary.unrealized_gain,
    buy_count: Number(buy_count_result || 0),
    sell_count: Number(sell_count_result || 0),
    win_count: 0,
    lose_count: 0,
  };

  await checkAndRecalculate(market);
}

async function refreshMarketData(market: Market): Promise<void> {
  is_loading_market.value[market] = true;
  try {
    await loadStatsForMarket(market);
  } finally {
    is_loading_market.value[market] = false;
  }
}

async function refreshAllMarkets(): Promise<void> {
  await Promise.all(
    (['tw', 'us'] as Market[]).map(async market => {
      await refreshMarketData(market);
    }),
  );
}

watch(
  is_ready,
  async ready => {
    if (!ready) return;

    is_loading.value = true;
    try {
      await refreshAllMarkets();
    } finally {
      is_loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <div>
    <div class="flex items-center mb-4">
      <h2 class="text-2xl">投資績效</h2>
    </div>

    <v-card class="mb-6 rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <v-expansion-panels variant="accordion" class="pa-0">
        <v-expansion-panel :title="performance_formula_items[0].label">
          <v-expansion-panel-text>
            <div class="space-y-4">
              <div
                v-for="item in performance_formula_items[0].lines"
                :key="item"
                class="text-xs"
                v-html="katex.renderToString(item, { throwOnError: false })"
              />
              <ul class="px-4 py-1 list-disc">
                <li v-for="note in performance_formula_items[0].notes" :key="note" class="mt-1">
                  {{ note }}
                </li>
              </ul>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
        <v-expansion-panel :title="performance_formula_items[1].label">
          <v-expansion-panel-text>
            <p class="px-4 py-1">顯示每一年結束時的累積總損益金額</p>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card>

    <div v-for="market in MARKET_OPTIONS" :key="market.value" class="mb-10">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <h3 class="text-xl font-medium">{{ market.title }}</h3>
          <v-chip size="x-small" variant="tonal" color="primary" class="text-[11px]">
            {{ market.value === 'us' ? 'USD' : 'TWD' }}
          </v-chip>
        </div>
        <v-btn
          variant="tonal"
          size="small"
          :loading="is_loading_market[market.value]"
          @click="refreshMarketData(market.value)"
        >
          重新計算
        </v-btn>
      </div>

      <v-row class="mb-4" align="stretch">
        <v-col sm="6" md="4" lg="2" class="flex items-stretch">
          <v-card class="rounded-lg w-full shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <v-card-text>
              <div class="text-neutral-400">已實現損益</div>
              <div
                class="font-bold text-base"
                :class="stats[market.value].realized_gain >= 0 ? 'text-rise' : 'text-fall'"
              >
                {{ stats[market.value].realized_gain >= 0 ? '+' : ''
                }}{{ stats[market.value].realized_gain.toLocaleString() }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col sm="6" md="4" lg="2" class="flex items-stretch">
          <v-card class="rounded-lg w-full shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <v-card-text>
              <div class="text-neutral-400">未實現損益</div>
              <div
                class="font-bold text-base"
                :class="stats[market.value].unrealized_gain >= 0 ? 'text-rise' : 'text-fall'"
              >
                {{ stats[market.value].unrealized_gain >= 0 ? '+' : ''
                }}{{ stats[market.value].unrealized_gain.toLocaleString() }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col sm="6" md="4" lg="2" class="flex items-stretch">
          <v-card class="rounded-lg w-full shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <v-card-text>
              <div class="text-neutral-400">股利收入</div>
              <div class="font-bold text-base text-rise">
                {{ stats[market.value].total_dividend.toLocaleString() }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col sm="6" md="4" lg="2" class="flex items-stretch">
          <v-card class="rounded-lg w-full shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <v-card-text>
              <div class="text-neutral-400">總損益</div>
              <div
                class="font-bold text-base"
                :class="stats[market.value].total_return >= 0 ? 'text-rise' : 'text-fall'"
              >
                {{ stats[market.value].total_return >= 0 ? '+' : ''
                }}{{ stats[market.value].total_return.toLocaleString() }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col sm="6" md="4" lg="2" class="flex items-stretch">
          <v-card class="rounded-lg w-full shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <v-card-text>
              <div class="text-neutral-400">交易次數</div>
              <div class="font-bold text-base">
                {{ stats[market.value].buy_count + stats[market.value].sell_count }}
              </div>
              <div class="text-sm text-neutral-400">
                {{ stats[market.value].buy_count }} 買 / {{ stats[market.value].sell_count }} 賣
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-row>
        <v-col cols="12" md="6">
          <v-card class="mb-4 rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <v-card-item>
              <span class="font-medium">年度報酬率</span>
            </v-card-item>
            <v-card-text>
              <div class="h-65">
                <Bar
                  v-if="annual_performance[market.value].length > 0"
                  :data="getPerformanceChartData(market.value)"
                  :options="getPerformanceChartOptions()"
                />
                <div v-else class="flex items-center justify-center h-full text-neutral-400">
                  尚無資料
                </div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="6">
          <v-card class="mb-4 rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <v-card-item>
              <span class="font-medium">年度累積損益</span>
            </v-card-item>
            <v-card-text>
              <div class="h-65">
                <Line
                  v-if="annual_performance[market.value].length > 0"
                  :data="getCumulativeChartData(market.value)"
                  :options="getCumulativeChartOptions()"
                />
                <div v-else class="flex items-center justify-center h-full text-neutral-400">
                  尚無資料
                </div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </div>
  </div>
</template>
