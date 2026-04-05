<script setup lang="ts">
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { Doughnut } from 'vue-chartjs';

import { useDatabase } from '../composables/useDatabase';
import { usePortfolio, type Holding } from '../composables/usePortfolio';
import { useStockPrice } from '../composables/useStockPrice';

ChartJS.register(ArcElement, Tooltip, Legend);

interface DistributionData {
  ticker: string;
  name: string;
  value: number;
}

const { is_ready } = useDatabase();
const { updatePrice, getPortfolioSummary } = usePortfolio();
const { fetchPricesBatch } = useStockPrice();

interface PortfolioSummary {
  holdings: Holding[];
  total_cost: number;
  total_value: number;
  total_unrealized: number;
}

const summary = ref<PortfolioSummary>({
  holdings: [],
  total_cost: 0,
  total_value: 0,
  total_unrealized: 0,
});

const is_loading_prices = ref(false);
const last_update = ref<string | null>(null);
const ticker_distribution = ref<DistributionData[]>([]);
let price_update_interval: ReturnType<typeof setInterval> | null = null;

function isMarketHours(): boolean {
  const now = new Date();
  const day = now.getDay();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const time_in_minutes = hours * 60 + minutes;

  if (day === 0 || day === 6) return false;
  if (time_in_minutes < 9 * 60 || time_in_minutes > 13 * 60 + 30) return false;
  return true;
}

function startPriceUpdateTimer() {
  if (price_update_interval) return;

  price_update_interval = setInterval(
    () => {
      if (isMarketHours() && summary.value.holdings.length > 0) {
        fetchAllPrices();
      }
    },
    5 * 60 * 1000,
  );
}

function stopPriceUpdateTimer() {
  if (price_update_interval) {
    clearInterval(price_update_interval);
    price_update_interval = null;
  }
}

function loadData() {
  const data = getPortfolioSummary();
  const holdings = data.holdings.filter(h => h.shares > 0);

  const total_cost = holdings.reduce((sum, h) => sum + h.total_cost, 0);
  const total_value = holdings.reduce(
    (sum, h) => sum + (h.current_price || h.avg_cost) * h.shares,
    0,
  );
  const total_unrealized = holdings.reduce((sum, h) => sum + (h.unrealized_gain || 0), 0);

  summary.value = {
    holdings,
    total_cost: total_cost,
    total_value: total_value,
    total_unrealized: total_unrealized,
  };
  loadTickerDistribution();
}

function loadTickerDistribution() {
  ticker_distribution.value = summary.value.holdings.map(h => ({
    ticker: h.ticker,
    name: h.name,
    value: (h.current_price || h.avg_cost) * h.shares,
  }));
}

const distribution_chart_data = computed(() => ({
  labels: ticker_distribution.value.map(t => t.name),
  datasets: [
    {
      data: ticker_distribution.value.map(t => t.value),
      backgroundColor: [
        '#00d9ff',
        '#ff6b6b',
        '#4ecdc4',
        '#ffe66d',
        '#95e1d3',
        '#f38181',
        '#aa96da',
        '#fcbad3',
      ],
    },
  ],
}));

const distribution_chart_options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right' as const,
    },
    tooltip: {
      callbacks: {
        label: (ctx: any) => {
          const item = ticker_distribution.value[ctx.dataIndex];
          return `${item.name} (${item.ticker}): ${item.value.toLocaleString()}`;
        },
      },
    },
  },
};

async function fetchAllPrices() {
  if (summary.value.holdings.length === 0) return;

  is_loading_prices.value = true;

  try {
    const tickers = summary.value.holdings.map(h => h.ticker);
    const prices = await fetchPricesBatch(tickers);

    for (const ticker of Object.keys(prices)) {
      updatePrice(ticker, prices[ticker]);
    }

    loadData();
    last_update.value = new Date().toLocaleTimeString();
  } finally {
    is_loading_prices.value = false;
  }
}

watch(is_ready, ready => {
  if (ready) {
    loadData();
  }
});

onMounted(() => {
  if (is_ready.value) {
    loadData();
    if (isMarketHours()) {
      fetchAllPrices();
      startPriceUpdateTimer();
    }
  }
});

onUnmounted(() => {
  stopPriceUpdateTimer();
});
</script>

<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-4">
      <h2 class="text-headline-small">投資組合</h2>
      <div class="d-flex align-center">
        <span v-if="last_update" class="text-grey mr-4">更新時間: {{ last_update }}</span>
        <v-btn
          variant="tonal"
          size="small"
          :loading="is_loading_prices"
          :disabled="summary.holdings.length === 0"
          @click="fetchAllPrices"
        >
          更新現價
        </v-btn>
      </div>
    </div>

    <v-row class="mb-4" align="stretch">
      <v-col sm="6" md="4">
        <v-card class="rounded-lg h-full" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-text>
            <div class="text-body-small text-grey">總成本</div>
            <div class="text-body-large font-weight-bold">
              {{ summary.total_cost.toLocaleString() }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col sm="6" md="4">
        <v-card class="rounded-lg h-full" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-text>
            <div class="text-body-small text-grey">總市值</div>
            <div class="text-body-large font-weight-bold">
              {{ summary.total_value.toLocaleString() }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col sm="6" md="4">
        <v-card class="rounded-lg h-full" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-text>
            <div class="text-body-small text-grey">未實現損益</div>
            <div
              class="text-body-large font-weight-bold"
              :class="summary.total_unrealized >= 0 ? 'text-success' : 'text-error'"
            >
              {{ summary.total_unrealized >= 0 ? '+' : ''
              }}{{ summary.total_unrealized.toLocaleString() }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card class="mb-4 rounded-lg" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
      <v-card-item class="text-base font-semibold pb-2">資產配置</v-card-item>
      <v-card-text>
        <div style="height: 300px">
          <Doughnut
            v-if="ticker_distribution.length > 0"
            :data="distribution_chart_data"
            :options="distribution_chart_options"
          />
          <div v-else class="d-flex align-center justify-center h-100 text-grey">尚無資料</div>
        </div>
      </v-card-text>
    </v-card>

    <v-card class="rounded-lg" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
      <v-card-item class="text-base font-semibold pb-2">持有部位</v-card-item>
      <v-card-text>
        <v-table>
          <thead>
            <tr class="bg-grey-lighten-4">
              <th class="text-left font-semibold text-grey-darken-1">商品代號</th>
              <th class="text-left font-semibold text-grey-darken-1">商品名稱</th>
              <th class="text-right font-semibold text-grey-darken-1">持有股數</th>
              <th class="text-right font-semibold text-grey-darken-1">平均成本</th>
              <th class="text-right font-semibold text-grey-darken-1">總成本</th>
              <th class="text-right font-semibold text-grey-darken-1">現價</th>
              <th class="text-right font-semibold text-grey-darken-1">市値</th>
              <th class="text-right font-semibold text-grey-darken-1">未實現損益</th>
              <th class="text-right font-semibold text-grey-darken-1">報酬率</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in summary.holdings" :key="h.ticker">
              <td class="font-weight-bold">{{ h.ticker }}</td>
              <td>{{ h.name || '-' }}</td>
              <td class="text-right">{{ h.shares.toLocaleString() }}</td>
              <td class="text-right">{{ h.avg_cost?.toLocaleString() }}</td>
              <td class="text-right">{{ h.total_cost?.toLocaleString() }}</td>
              <td class="text-right">{{ h.current_price?.toLocaleString() || '-' }}</td>
              <td class="text-right">
                {{ ((h.current_price || h.avg_cost) * h.shares).toLocaleString() }}
              </td>
              <td
                class="text-right"
                :class="(h.unrealized_gain || 0) >= 0 ? 'text-success' : 'text-error'"
              >
                {{ (h.unrealized_gain || 0) >= 0 ? '+' : ''
                }}{{ (h.unrealized_gain || 0).toLocaleString() }}
              </td>
              <td
                class="text-right"
                :class="(h.unrealized_gain_percent || 0) >= 0 ? 'text-success' : 'text-error'"
              >
                {{ (h.unrealized_gain_percent || 0) >= 0 ? '+' : ''
                }}{{ (h.unrealized_gain_percent || 0).toFixed(2) }}%
              </td>
            </tr>
            <tr v-if="summary.holdings.length === 0">
              <td colspan="9" class="text-center text-grey pa-4">尚無持有部位</td>
            </tr>
          </tbody>
        </v-table>
        <div class="text-body-small text-grey mt-2">* 系統會自動抓取 TWSE 即時報價</div>
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped>
.summary-highlight {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.summary-highlight .text-body-small {
  color: #aaa;
}
</style>
