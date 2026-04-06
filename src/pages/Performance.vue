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
import { ref, onMounted, watch, computed } from 'vue';
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
const { dividends, loadDividends, getDividendsByTicker } = useDividends();
const { getPortfolioSummary, getRealizedGain } = usePortfolio();
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

async function loadStats() {
  loadTransactions({ sort_order: 'ASC' });
  loadDividends({ sort_order: 'ASC' });

  const summary = getPortfolioSummary();

  stats.value.realized_gain = getRealizedGain();
  stats.value.unrealized_gain = summary.total_unrealized;
  stats.value.total_dividend = dividends.value.reduce((sum, d) => sum + d.amount, 0);
  stats.value.total_return =
    stats.value.realized_gain + stats.value.total_dividend + summary.total_unrealized;
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

  const stock_yearly_data = new Map<
    number,
    Map<
      string,
      {
        total_cost: number;
        bought_shares: number;
        total_proceeds: number;
        sold_shares: number;
      }
    >
  >();

  for (const t of transactions.value) {
    const year = parseInt(t.date.substring(0, 4));

    if (!stock_yearly_data.has(year)) {
      stock_yearly_data.set(year, new Map());
    }

    const year_data = stock_yearly_data.get(year)!;

    if (!year_data.has(t.ticker)) {
      year_data.set(t.ticker, {
        total_cost: 0,
        bought_shares: 0,
        total_proceeds: 0,
        sold_shares: 0,
      });
    }

    const stock_data = year_data.get(t.ticker)!;

    if (t.type === 'buy') {
      stock_data.total_cost += t.net_amount;
      stock_data.bought_shares += t.shares;
    } else if (t.type === 'sell') {
      stock_data.total_proceeds += t.net_amount;
      stock_data.sold_shares += t.shares;
    }
  }

  const annual_data_list: AnnualData[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (let year = first_year; year <= current_year; year++) {
    if (!stock_yearly_data.has(year)) {
      annual_data_list.push({
        year,
        realized_return_rate: 0,
        unrealized_return_rate: 0,
        total_return_rate: 0,
        total_gain: 0,
      });
      continue;
    }

    const next_year = year + 1;
    let total_realized_gain = 0;
    let total_unrealized_gain = 0;
    let total_return_rate = 0;
    let total_cost_of_realized_gain = 0;
    let total_cost_of_unrealized_gain = 0;

    const yearly_data = stock_yearly_data.get(year)!;

    for (const [ticker, stock_data] of yearly_data) {
      const dividend = getDividendsByTicker(ticker, year);
      const avg_price = (stock_data.total_cost - dividend) / stock_data.bought_shares;

      const last_trade_day = year == current_year ? today : `${year}-12-31`;
      const last_trade_day_price = (await fetchHistoricalPrice(ticker, last_trade_day)) || 0;
      const remaining_shares = stock_data.bought_shares - stock_data.sold_shares;

      const realized_gain = stock_data.total_proceeds - stock_data.sold_shares * avg_price;
      const unrealized_gain = remaining_shares * (last_trade_day_price - avg_price);

      total_realized_gain += realized_gain;
      total_unrealized_gain += unrealized_gain;
      total_cost_of_realized_gain += stock_data.sold_shares * avg_price;
      total_cost_of_unrealized_gain += remaining_shares * avg_price;

      if (remaining_shares == 0) continue;

      if (!stock_yearly_data.has(next_year)) {
        stock_yearly_data.set(next_year, new Map());
      }

      const yearly_data_next = stock_yearly_data.get(next_year)!;

      if (!yearly_data_next.has(ticker)) {
        yearly_data_next.set(ticker, {
          total_cost: 0,
          bought_shares: 0,
          total_proceeds: 0,
          sold_shares: 0,
        });
      }

      const stock_data_next_year = yearly_data_next.get(ticker)!;

      stock_data_next_year.total_cost += remaining_shares * last_trade_day_price;
      stock_data_next_year.bought_shares += remaining_shares;
    }

    total_return_rate =
      (total_realized_gain + total_unrealized_gain) /
      (total_cost_of_realized_gain + total_cost_of_unrealized_gain);
    const realized_return_rate =
      total_cost_of_realized_gain > 0 ? total_realized_gain / total_cost_of_realized_gain : 0;
    const unrealized_return_rate =
      total_cost_of_unrealized_gain > 0 ? total_unrealized_gain / total_cost_of_unrealized_gain : 0;

    annual_data_list.push({
      year,
      realized_return_rate,
      unrealized_return_rate,
      total_return_rate,
      total_gain: total_realized_gain + total_unrealized_gain,
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

watch(is_ready, ready => {
  if (ready) {
    loadStats();
  }
});

onMounted(() => {
  if (is_ready.value) {
    loadStats();
  }
});
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h2 class="text-headline-small">投資績效</h2>
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
      <v-col v-for="i in 5" :key="i" sm="6" md="4" lg="2" class="d-flex align-stretch">
        <v-card class="rounded-lg w-100" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-text class="h-100">
            <template v-if="i === 1">
              <div class="text-body-small text-grey">已實現損益</div>
              <div
                class="text-body-large font-weight-bold"
                :class="stats.realized_gain >= 0 ? 'text-success' : 'text-error'"
              >
                {{ stats.realized_gain >= 0 ? '+' : '' }}{{ stats.realized_gain.toLocaleString() }}
              </div>
            </template>
            <template v-else-if="i === 2">
              <div class="text-body-small text-grey">未實現損益</div>
              <div
                class="text-body-large font-weight-bold"
                :class="stats.unrealized_gain >= 0 ? 'text-success' : 'text-error'"
              >
                {{ stats.unrealized_gain >= 0 ? '+' : ''
                }}{{ stats.unrealized_gain.toLocaleString() }}
              </div>
            </template>
            <template v-else-if="i === 3">
              <div class="text-body-small text-grey">股利收入</div>
              <div class="text-body-large font-weight-bold text-success">
                {{ stats.total_dividend.toLocaleString() }}
              </div>
            </template>
            <template v-else-if="i === 4">
              <div class="text-body-small text-grey">總損益</div>
              <div
                class="text-body-large font-weight-bold"
                :class="stats.total_return >= 0 ? 'text-success' : 'text-error'"
              >
                {{ stats.total_return >= 0 ? '+' : '' }}{{ stats.total_return.toLocaleString() }}
              </div>
            </template>
            <template v-else-if="i === 5">
              <div class="text-body-small text-grey">交易次數</div>
              <div class="text-body-large font-weight-bold">
                {{ stats.buy_count + stats.sell_count }}
              </div>
              <div class="text-body-small text-grey">
                {{ stats.buy_count }} 買 / {{ stats.sell_count }} 賣
              </div>
            </template>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" md="6">
        <v-card class="mb-4 rounded-lg" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-item>
            <div class="d-flex align-center">
              <span class="text-base font-semibold">年度報酬率</span>
              <v-tooltip origin="start center" transition="scale-transition">
                <template v-slot:activator="{ props }">
                  <v-icon v-bind="props" size="small" class="ml-1" color="grey">
                    mdi-help-circle-outline
                  </v-icon>
                </template>
                <ul class="pa-0 ml-4">
                  <li>
                    <span
                      class="text-body-small"
                      v-html="
                        katex.renderToString(
                          '\\text{已實現報酬成本} = \\sum (\\text{買入均價} \\times \\text{賣出股數} - \\text{實發股利} \\times \\dfrac{\\text{賣出股數}}{\\text{總初始股數}})',
                          { throwOnError: false },
                        )
                      "
                    />
                  </li>
                  <li class="mt-2">
                    <span
                      class="text-body-small"
                      v-html="
                        katex.renderToString(
                          '\\text{未實現報酬成本} = \\sum (\\text{買入均價} \\times \\text{剩餘股數} - \\text{實發股利} \\times \\dfrac{\\text{剩餘股數}}{\\text{總初始股數}})',
                          { throwOnError: false },
                        )
                      "
                    />
                  </li>
                  <li class="mt-2">
                    <span
                      class="text-body-small"
                      v-html="
                        katex.renderToString(
                          '\\text{已實現報酬率} = \\dfrac{\\sum (\\text{賣出價} \\times \\text{賣出股數}) - \\text{已實現報酬成本}}{\\text{已實現報酬成本}} \\times 100\\%',
                          { throwOnError: false },
                        )
                      "
                    />
                  </li>
                  <li class="mt-2">
                    <span
                      class="text-body-small"
                      v-html="
                        katex.renderToString(
                          '\\text{未實現報酬率} = \\dfrac{\\sum (\\text{期末收盤價} \\times \\text{賣出股數}) - \\text{未實現報酬成本}}{\\text{未實現報酬成本}} \\times 100\\%',
                          { throwOnError: false },
                        )
                      "
                    />
                  </li>
                  <li class="mt-2">
                    <span
                      class="text-body-small"
                      v-html="
                        katex.renderToString(
                          '\\text{總報酬率} = \\text{已實現報酬率} \\times \\dfrac{\\text{賣出股數}}{\\text{總初始股數}} + \\text{未實現報酬率} \\times \\dfrac{\\text{剩餘股數}}{\\text{總初始股數}}',
                          { throwOnError: false },
                        )
                      "
                    />
                  </li>
                  <li class="mt-1">購買手續費會記入成本，賣出手續費和交易稅會從收入扣除</li>
                  <li class="mt-1">實發股利會被拿來平攤成本</li>
                  <li class="mt-1">剩餘股票以當年年末收盤價作為成本價留到隔年繼續計算</li>
                </ul>
              </v-tooltip>
            </div>
          </v-card-item>
          <v-card-text>
            <div style="height: 250px">
              <Chart
                v-if="annual_performance.length > 0"
                type="bar"
                :data="performance_chart_data"
                :options="performance_chart_options"
              />
              <div v-else class="d-flex align-center justify-center h-100 text-grey">尚無資料</div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card class="mb-4 rounded-lg" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-item>
            <div class="d-flex align-center">
              <span class="text-base font-semibold">年度累積損益</span>
              <v-tooltip origin="start center" transition="scale-transition">
                <template v-slot:activator="{ props }">
                  <v-icon v-bind="props" size="small" class="ml-1" color="grey">
                    mdi-help-circle-outline
                  </v-icon>
                </template>
                <span class="text-body-small">從第一年到該年的累積損益金額</span>
              </v-tooltip>
            </div>
          </v-card-item>
          <v-card-text>
            <div style="height: 250px">
              <Chart
                v-if="annual_performance.length > 0"
                type="line"
                :data="cumulative_chart_data"
                :options="cumulative_chart_options"
              />
              <div v-else class="d-flex align-center justify-center h-100 text-grey">尚無資料</div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>
