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
import { ref, watch, computed } from 'vue';
import { Chart } from 'vue-chartjs';

import { useDatabase } from '../composables/useDatabase';
import { useDividends } from '../composables/useDividends';
import { usePortfolio } from '../composables/usePortfolio';
import { useStockPrice } from '../composables/useStockPrice';
import { useTransactions } from '../composables/useTransactions';

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
const { transactions, loadTransactions } = useTransactions();
const { dividends, loadDividends } = useDividends();
const { getPortfolioSummary } = usePortfolio();
const { fetchHistoricalPrice } = useStockPrice();

const is_loading = ref(false);

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

const stats = ref<PerformanceStats>({
  realized_gain: 0,
  unrealized_gain: 0,
  total_dividend: 0,
  total_return: 0,
  buy_count: 0,
  sell_count: 0,
  win_count: 0,
  lose_count: 0,
});

interface AnnualData {
  year: number;
  realized_return_rate: number;
  unrealized_return_rate: number;
  total_return_rate: number;
  total_gain: number;
}

const annual_performance = ref<AnnualData[]>([]);

interface YearlyHolding {
  shares: number;
  carry_cost: number;
}

interface YearlyTransactionGroup {
  [year: number]: ReturnType<typeof loadTransactions>;
}

interface YearlyDividendGroup {
  [year: number]: number;
}

function getSaleCostRate(ticker: string): number {
  const fee_rate = 0.001425;
  const tax_rate = ticker.startsWith('00') ? 0.001 : 0.003;
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

function groupTransactionsByYear(): YearlyTransactionGroup {
  const grouped: YearlyTransactionGroup = {};

  for (const transaction of transactions.value) {
    const year = parseInt(transaction.date.substring(0, 4));

    if (!grouped[year]) {
      grouped[year] = [];
    }

    grouped[year].push(transaction);
  }

  return grouped;
}

function groupDividendsByYear(): YearlyDividendGroup {
  const grouped: YearlyDividendGroup = {};

  for (const dividend of dividends.value) {
    const year = parseInt(dividend.pay_date.substring(0, 4));

    if (!grouped[year]) {
      grouped[year] = 0;
    }

    grouped[year] += dividend.amount;
  }

  return grouped;
}

async function loadStats() {
  loadTransactions({ sort_order: 'ASC' });
  loadDividends({ sort_order: 'ASC' });

  const summary = getPortfolioSummary();

  stats.value.realized_gain = summary.realized_gain;
  stats.value.unrealized_gain = summary.unrealized_gain;
  stats.value.total_dividend = dividends.value.reduce((sum, d) => sum + d.amount, 0);
  stats.value.total_return =
    summary.realized_gain + stats.value.total_dividend + summary.unrealized_gain;
  stats.value.buy_count = transactions.value.filter(t => t.type === 'buy').length;
  stats.value.sell_count = transactions.value.filter(t => t.type === 'sell').length;

  await checkAndRecalculate();
}

async function handleRefresh() {
  is_loading.value = true;
  await loadAnnualPerformance();
  is_loading.value = false;
}

async function loadAnnualPerformance() {
  if (transactions.value.length === 0) return;

  const first_year = parseInt(transactions.value[0].date.substring(0, 4));
  const current_year = parseInt(new Date().getFullYear().toString());
  const annual_data_list: AnnualData[] = [];
  const transactions_by_year = groupTransactionsByYear();
  const dividends_by_year = groupDividendsByYear();
  let carry_holdings = new Map<string, YearlyHolding>();

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

      const end_price = (await fetchHistoricalPrice(ticker, end_date)) || 0;
      const end_value = holding.shares * end_price * getSaleCostRate(ticker);

      total_unrealized_gain += end_value - holding.carry_cost;
      holding.carry_cost = end_value;
    }

    const invested_capital = beginning_value + weighted_cash_flow;
    const realized_component = total_realized_gain + dividend_income;
    const total_gain = realized_component + total_unrealized_gain;
    const realized_return_rate = realized_component / invested_capital;
    const unrealized_return_rate = total_unrealized_gain / invested_capital;
    const total_return_rate = total_gain / invested_capital;

    annual_data_list.push({
      year,
      realized_return_rate,
      unrealized_return_rate,
      total_return_rate,
      total_gain,
    });
  }

  annual_performance.value = annual_data_list;
  saveAnnualPerformanceCache(annual_performance.value);
}

interface AnnualDataCache {
  data: AnnualData[];
  calculated_at: string;
}

function saveAnnualPerformanceCache(data: AnnualData[]) {
  const cache: AnnualDataCache = {
    data,
    calculated_at: new Date().toISOString().split('T')[0],
  };
  localStorage.setItem('annual_performance_cache', JSON.stringify(cache));
}

async function checkAndRecalculate(): Promise<void> {
  const stored = localStorage.getItem('annual_performance_cache');
  const cached = stored ? (JSON.parse(stored) as AnnualDataCache) : null;

  const latest_transaction = query('SELECT MAX(date) as max_date FROM transactions') as {
    max_date: string;
  }[];
  const latest_dividend = query('SELECT MAX(pay_date) as max_date FROM dividends') as {
    max_date: string;
  }[];

  const latest_data_date = latest_transaction[0]?.max_date || '';
  const latest_dividend_date = latest_dividend[0]?.max_date || '';

  let need_recalculate = false;

  if (!cached) {
    need_recalculate = true;
  } else if (
    latest_data_date > cached.calculated_at ||
    latest_dividend_date > cached.calculated_at
  ) {
    need_recalculate = true;
  }

  if (need_recalculate) {
    await loadAnnualPerformance();
  } else if (cached) {
    annual_performance.value = cached.data;
  }
}

const performance_chart_data = computed(() => {
  return {
    labels: annual_performance.value.map(a => a.year),
    datasets: [
      {
        label: '總報酬率',
        data: annual_performance.value.map(a => a.total_return_rate * 100),
        backgroundColor: '#4caf50',
        borderRadius: 4,
        barPercentage: 0.6,
      },
      {
        label: '已實現',
        data: annual_performance.value.map(a => a.realized_return_rate * 100),
        backgroundColor: '#2196f3',
        borderRadius: 4,
        barPercentage: 0.6,
      },
      {
        label: '未實現',
        data: annual_performance.value.map(a => a.unrealized_return_rate * 100),
        backgroundColor: '#ff9800',
        borderRadius: 4,
        barPercentage: 0.6,
      },
    ],
  };
});

const cumulative_chart_data = computed(() => {
  const cumulative_data: number[] = [];
  let running_total = 0;

  for (const a of annual_performance.value) {
    running_total += a.total_gain;
    cumulative_data.push(running_total);
  }

  return {
    labels: annual_performance.value.map(a => a.year),
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
});

const performance_chart_options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
    },
    tooltip: {
      callbacks: {
        label: (context: any) => {
          return [`${context.dataset.label}: ${context.raw?.toFixed(2)}%`];
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
        callback: (value: number | string) => Number(value).toFixed(1) + '%',
      },
    },
  },
};

const cumulative_chart_options = {
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

watch(
  is_ready,
  async ready => {
    if (!ready) return;
    loadStats();
    await handleRefresh();
  },
  { immediate: true },
);
</script>

<template>
  <div>
    <div class="flex items-center mb-4">
      <h2 class="text-2xl">投資績效</h2>
      <v-btn
        class="ml-auto"
        variant="tonal"
        size="small"
        :loading="is_loading"
        @click="handleRefresh"
      >
        重新計算
      </v-btn>
    </div>

    <v-row class="mb-4" align="stretch">
      <v-col v-for="i in 5" :key="i" sm="6" md="4" lg="2" class="flex items-stretch">
        <v-card class="rounded-lg w-full shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
          <v-card-text class="h-full">
            <template v-if="i === 1">
              <div class="text-neutral-400">已實現損益</div>
              <div
                class="font-bold text-base"
                :class="stats.realized_gain >= 0 ? 'text-success' : 'text-error'"
              >
                {{ stats.realized_gain >= 0 ? '+' : '' }}{{ stats.realized_gain.toLocaleString() }}
              </div>
            </template>
            <template v-else-if="i === 2">
              <div class="text-neutral-400">未實現損益</div>
              <div
                class="font-bold text-base"
                :class="stats.unrealized_gain >= 0 ? 'text-success' : 'text-error'"
              >
                {{ stats.unrealized_gain >= 0 ? '+' : ''
                }}{{ stats.unrealized_gain.toLocaleString() }}
              </div>
            </template>
            <template v-else-if="i === 3">
              <div class="text-neutral-400">股利收入</div>
              <div class="font-bold text-base text-success">
                {{ stats.total_dividend.toLocaleString() }}
              </div>
            </template>
            <template v-else-if="i === 4">
              <div class="text-neutral-400">總損益</div>
              <div
                class="font-bold text-base"
                :class="stats.total_return >= 0 ? 'text-success' : 'text-error'"
              >
                {{ stats.total_return >= 0 ? '+' : '' }}{{ stats.total_return.toLocaleString() }}
              </div>
            </template>
            <template v-else-if="i === 5">
              <div class="text-neutral-400">交易次數</div>
              <div class="font-bold text-base">
                {{ stats.buy_count + stats.sell_count }}
              </div>
              <div class="text-sm text-neutral-400">
                {{ stats.buy_count }} 買 / {{ stats.sell_count }} 賣
              </div>
            </template>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" md="6">
        <v-card class="mb-4 rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
          <v-card-item>
            <div class="flex items-center">
              <span class="font-medium">年度報酬率</span>
              <v-tooltip origin="start center" transition="scale-transition">
                <template v-slot:activator="{ props }">
                  <v-icon v-bind="props" size="small" class="ml-1" color="neutral-400">
                    mdi-help-circle-outline
                  </v-icon>
                </template>
                <ul class="px-4 py-2 list-disc">
                  <li>
                    <span
                      class="text-xs"
                      v-html="
                        katex.renderToString(
                          '\\text{加權投入資本} = \\text{年初部位淨值} + \\sum (\\text{買入金額} \\times \\text{剩餘年度權重}) - \\sum (\\text{賣出金額} \\times \\text{剩餘年度權重})',
                          { throwOnError: false },
                        )
                      "
                    />
                  </li>
                  <li class="mt-2">
                    <span
                      class="text-xs"
                      v-html="
                        katex.renderToString(
                          '\\text{年末持股淨值} = \\sum (\\text{年末收盤價} \\times \\text{持股}) \\times (1 - \\text{手續費率} - \\text{交易稅率})',
                          { throwOnError: false },
                        )
                      "
                    />
                  </li>
                  <li class="mt-2">
                    <span
                      class="text-xs"
                      v-html="
                        katex.renderToString(
                          '\\text{已實現報酬率} = \\dfrac{\\text{賣出已實現損益} + \\text{股利收入}}{\\text{加權投入資本}} \\times 100\\%',
                          { throwOnError: false },
                        )
                      "
                    />
                  </li>
                  <li class="mt-2">
                    <span
                      class="text-xs"
                      v-html="
                        katex.renderToString(
                          '\\text{未實現報酬率} = \\dfrac{\\text{年末持股淨值} - \\text{年末剩餘成本}}{\\text{加權投入資本}} \\times 100\\%',
                          { throwOnError: false },
                        )
                      "
                    />
                  </li>
                  <li class="mt-2">
                    <span
                      class="text-xs"
                      v-html="
                        katex.renderToString(
                          '\\text{總報酬率} = \\dfrac{\\text{已實現損益} + \\text{股利收入} + \\text{未實現損益}}{\\text{加權投入資本}} \\times 100\\%',
                          { throwOnError: false },
                        )
                      "
                    />
                  </li>
                  <li class="mt-1">採用現金流加權的年度報酬率，接近 Modified Dietz 的年度算法</li>
                  <li class="mt-1">
                    購買手續費會記入成本，賣出手續費和交易稅會從收入與年末淨值扣除
                  </li>
                  <li class="mt-1">剩餘股票以當年年末估算淨值結轉到隔年繼續計算</li>
                </ul>
              </v-tooltip>
            </div>
          </v-card-item>
          <v-card-text>
            <div class="h-65">
              <Chart
                v-if="annual_performance.length > 0"
                type="bar"
                :data="performance_chart_data"
                :options="performance_chart_options"
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
            <div class="flex items-center">
              <span class="font-medium">年度累積損益</span>
              <v-tooltip origin="start center" transition="scale-transition">
                <template v-slot:activator="{ props }">
                  <v-icon v-bind="props" size="small" class="ml-1" color="neutral-400">
                    mdi-help-circle-outline
                  </v-icon>
                </template>
                <span class="text-sm">從第一年到該年的累積損益金額</span>
              </v-tooltip>
            </div>
          </v-card-item>
          <v-card-text>
            <div class="h-65">
              <Chart
                v-if="annual_performance.length > 0"
                type="line"
                :data="cumulative_chart_data"
                :options="cumulative_chart_options"
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
</template>
