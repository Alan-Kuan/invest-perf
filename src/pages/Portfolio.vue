<script setup lang="ts">
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { ref, computed, onUnmounted, watch } from 'vue';
import { Doughnut } from 'vue-chartjs';

import { useDatabase } from '../composables/useDatabase';
import { usePortfolio, type PortfolioSummary } from '../composables/usePortfolio';
import { useStockPrice } from '../composables/useStockPrice';

ChartJS.register(ArcElement, Tooltip, Legend);

const { is_ready } = useDatabase();
const { getPortfolioSummary, updateCurrPricesCache } = usePortfolio();
const { fetchPricesBatch } = useStockPrice();

const summary = ref<PortfolioSummary>({
  holdings: [],
  total_cost: 0,
  total_value: 0,
  realized_gain: 0,
  unrealized_gain: 0,
});

const is_loading_prices = ref(false);
const last_update = ref<number | null>(loadLastUpdate());
let price_update_interval: ReturnType<typeof setInterval> | null = null;

const portfolio_roi = computed(() => {
  if (summary.value.total_cost <= 0) return null;
  return (summary.value.unrealized_gain / summary.value.total_cost) * 100;
});

const last_update_display = computed(() => {
  if (!last_update.value) return null;
  return new Date(last_update.value).toLocaleTimeString();
});

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
          const item = summary.value.holdings[ctx.dataIndex];
          return `${item.name} (${item.ticker}): ${item.total_value?.toLocaleString()}`;
        },
      },
    },
  },
};

const distribution_chart_data = computed(() => ({
  labels: summary.value.holdings.map(t => t.name),
  datasets: [
    {
      data: summary.value.holdings.map(t => t.total_value || 0),
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

function loadLastUpdate(): number | null {
  const stored = localStorage.getItem('price_last_update');
  return stored ? parseInt(stored, 10) : null;
}

function saveLastUpdate(ts: number): void {
  localStorage.setItem('price_last_update', ts.toString());
}

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

async function fetchAllPrices() {
  if (summary.value.holdings.length === 0) return;

  const now = Date.now();
  const last_ts = last_update.value;
  if (last_ts && !isMarketHours()) {
    const hours_since_update = (now - last_ts) / (1000 * 60 * 60);
    if (hours_since_update < 8) return;
  }

  is_loading_prices.value = true;

  try {
    const tickers = summary.value.holdings.map(h => h.ticker);
    const prices = await fetchPricesBatch(tickers);

    updateCurrPricesCache(prices);
    summary.value = getPortfolioSummary();
    last_update.value = now;
    saveLastUpdate(now);
  } finally {
    is_loading_prices.value = false;
  }
}

watch(
  is_ready,
  async ready => {
    if (!ready) return;

    summary.value = getPortfolioSummary();
    await fetchAllPrices();
    if (isMarketHours()) {
      startPriceUpdateTimer();
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  stopPriceUpdateTimer();
});
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-2xl">投資組合</h2>
      <div class="flex items-center">
        <span v-if="last_update_display" class="text-neutral-400 mr-4"
          >更新時間: {{ last_update_display }}</span
        >
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
      <v-col sm="6" md="3">
        <v-card class="rounded-lg h-full shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
          <v-card-text>
            <div class="text-neutral-400">總成本</div>
            <div class="font-bold text-base">
              {{ summary.total_cost.toLocaleString() }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col sm="6" md="3">
        <v-card class="rounded-lg h-full shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
          <v-card-text>
            <div class="text-neutral-400">總現值</div>
            <div class="font-bold text-base">
              {{ summary.total_value.toLocaleString() }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col sm="6" md="3">
        <v-card class="rounded-lg h-full shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
          <v-card-text>
            <div class="flex items-center text-neutral-400">
              預估淨損益
              <v-tooltip text="考慮手續費（0.1425%）與交易稅（股票：0.3%、ETF：0.1%)">
                <template v-slot:activator="{ props }">
                  <v-icon size="x-small" class="ml-1" v-bind="props">mdi-help-circle</v-icon>
                </template>
              </v-tooltip>
            </div>
            <div
              class="font-bold text-base"
              :class="summary.unrealized_gain >= 0 ? 'text-success' : 'text-error'"
            >
              {{ summary.unrealized_gain >= 0 ? '+' : ''
              }}{{ summary.unrealized_gain.toLocaleString() }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col sm="6" md="3">
        <v-card class="rounded-lg h-full shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
          <v-card-text>
            <div class="text-neutral-400">預估報酬率</div>
            <div
              v-if="portfolio_roi !== null"
              class="font-bold text-base"
              :class="portfolio_roi >= 0 ? 'text-success' : 'text-error'"
            >
              {{ portfolio_roi >= 0 ? '+' : '' }}{{ portfolio_roi.toFixed(2) }}%
            </div>
            <div v-else class="font-bold text-base text-neutral-400">-</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card class="mb-4 rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <v-card-item class="font-medium pb-2">資產配置</v-card-item>
      <v-card-text>
        <div class="h-80">
          <Doughnut
            v-if="summary.holdings.length > 0"
            :data="distribution_chart_data"
            :options="distribution_chart_options"
          />
          <div v-else class="flex items-center justify-center h-full text-neutral-400">
            尚無資料
          </div>
        </div>
      </v-card-text>
    </v-card>

    <v-card class="rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <v-card-item class="font-medium pb-2">持有部位</v-card-item>
      <v-card-text>
        <v-table>
          <thead>
            <tr class="bg-neutral-100">
              <th class="text-left font-medium text-neutral-500">商品代號</th>
              <th class="text-left font-medium text-neutral-500">商品名稱</th>
              <th class="text-right font-medium text-neutral-500">持有股數</th>
              <th class="text-right font-medium text-neutral-500 relative">
                <div class="flex items-center justify-end">
                  平均成本
                  <v-tooltip text="考慮手續費的每股平均成本">
                    <template v-slot:activator="{ props }">
                      <v-icon size="x-small" class="absolute left--2.5" v-bind="props"
                        >mdi-help-circle</v-icon
                      >
                    </template>
                  </v-tooltip>
                </div>
              </th>
              <th class="text-right font-medium text-neutral-500">總成本</th>
              <th class="text-right font-medium text-neutral-500">現價</th>
              <th class="text-right font-medium text-neutral-500">現值</th>
              <th class="text-right font-medium text-neutral-500 relative">
                <div class="flex items-center justify-end">
                  預估淨損益
                  <v-tooltip text="考慮手續費（0.1425%）與交易稅（股票：0.3%、ETF：0.1%)">
                    <template v-slot:activator="{ props }">
                      <v-icon size="x-small" class="absolute left--2.5" v-bind="props"
                        >mdi-help-circle</v-icon
                      >
                    </template>
                  </v-tooltip>
                </div>
              </th>
              <th class="text-right font-medium text-neutral-500">預估報酬率</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in summary.holdings" :key="h.ticker">
              <td class="font-bold">{{ h.ticker }}</td>
              <td>{{ h.name || '-' }}</td>
              <td class="text-right">{{ h.shares.toLocaleString() }}</td>
              <td class="text-right">{{ (h.total_cost / h.shares).toLocaleString() }}</td>
              <td class="text-right">{{ h.total_cost.toLocaleString() }}</td>
              <td class="text-right">{{ h.curr_price?.toLocaleString() || '-' }}</td>
              <td class="text-right">
                {{ h.total_value?.toLocaleString() }}
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
                :class="(h.unrealized_roi || 0) >= 0 ? 'text-success' : 'text-error'"
              >
                {{ (h.unrealized_roi || 0) >= 0 ? '+' : ''
                }}{{ (h.unrealized_roi || 0).toFixed(2) }}%
              </td>
            </tr>
            <tr v-if="summary.holdings.length === 0">
              <td colspan="9" class="text-center text-neutral-400 pa-4">尚無持有部位</td>
            </tr>
          </tbody>
        </v-table>
        <div class="text-sm text-neutral-400 mt-2">* 系統會自動抓取 TWSE 即時報價</div>
      </v-card-text>
    </v-card>
  </div>
</template>
