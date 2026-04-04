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

const { isReady } = useDatabase();
const { updatePrice, getPortfolioSummary } = usePortfolio();
const { fetchPricesBatch } = useStockPrice();

interface PortfolioSummary {
  holdings: Holding[];
  totalCost: number;
  totalValue: number;
  totalUnrealized: number;
}

const summary = ref<PortfolioSummary>({
  holdings: [],
  totalCost: 0,
  totalValue: 0,
  totalUnrealized: 0,
});

const isLoadingPrices = ref(false);
const lastUpdate = ref<string | null>(null);
const tickerDistribution = ref<DistributionData[]>([]);
let priceUpdateInterval: ReturnType<typeof setInterval> | null = null;

function isMarketHours(): boolean {
  const now = new Date();
  const day = now.getDay();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  if (day === 0 || day === 6) return false;
  if (timeInMinutes < 9 * 60 || timeInMinutes > 13 * 60 + 30) return false;
  return true;
}

function startPriceUpdateTimer() {
  if (priceUpdateInterval) return;

  priceUpdateInterval = setInterval(
    () => {
      if (isMarketHours() && summary.value.holdings.length > 0) {
        fetchAllPrices();
      }
    },
    5 * 60 * 1000,
  );
}

function stopPriceUpdateTimer() {
  if (priceUpdateInterval) {
    clearInterval(priceUpdateInterval);
    priceUpdateInterval = null;
  }
}

function loadData() {
  const data = getPortfolioSummary();
  const holdings = data.holdings.filter(h => h.shares > 0);

  const totalCost = holdings.reduce((sum, h) => sum + h.total_cost, 0);
  const totalValue = holdings.reduce(
    (sum, h) => sum + (h.currentPrice || h.avg_cost) * h.shares,
    0,
  );
  const totalUnrealized = holdings.reduce((sum, h) => sum + (h.unrealizedGain || 0), 0);

  summary.value = {
    holdings,
    totalCost,
    totalValue,
    totalUnrealized,
  };
  loadTickerDistribution();
}

function loadTickerDistribution() {
  tickerDistribution.value = summary.value.holdings.map(h => ({
    ticker: h.ticker,
    name: h.name,
    value: (h.currentPrice || h.avg_cost) * h.shares,
  }));
}

const distributionChartData = computed(() => ({
  labels: tickerDistribution.value.map(t => t.name),
  datasets: [
    {
      data: tickerDistribution.value.map(t => t.value),
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

const distributionChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right' as const,
    },
    tooltip: {
      callbacks: {
        label: (ctx: any) => {
          const item = tickerDistribution.value[ctx.dataIndex];
          return `${item.name} (${item.ticker}): ${item.value.toLocaleString()}`;
        },
      },
    },
  },
};

const fetchAllPrices = async () => {
  if (summary.value.holdings.length === 0) return;

  isLoadingPrices.value = true;

  try {
    const tickers = summary.value.holdings.map(h => h.ticker);
    const prices = await fetchPricesBatch(tickers);

    for (const ticker of Object.keys(prices)) {
      updatePrice(ticker, prices[ticker]);
    }

    loadData();
    lastUpdate.value = new Date().toLocaleTimeString();
  } finally {
    isLoadingPrices.value = false;
  }
};

watch(isReady, ready => {
  if (ready) {
    loadData();
  }
});

onMounted(() => {
  if (isReady.value) {
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
        <span v-if="lastUpdate" class="text-grey mr-4">更新時間: {{ lastUpdate }}</span>
        <v-btn
          variant="tonal"
          size="small"
          :loading="isLoadingPrices"
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
              {{ summary.totalCost.toLocaleString() }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col sm="6" md="4">
        <v-card class="rounded-lg h-full" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-text>
            <div class="text-body-small text-grey">總市值</div>
            <div class="text-body-large font-weight-bold">
              {{ summary.totalValue.toLocaleString() }}
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
              :class="summary.totalUnrealized >= 0 ? 'text-success' : 'text-error'"
            >
              {{ summary.totalUnrealized >= 0 ? '+' : ''
              }}{{ summary.totalUnrealized.toLocaleString() }}
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
            v-if="tickerDistribution.length > 0"
            :data="distributionChartData"
            :options="distributionChartOptions"
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
              <td class="text-right">{{ h.currentPrice?.toLocaleString() || '-' }}</td>
              <td class="text-right">
                {{ ((h.currentPrice || h.avg_cost) * h.shares).toLocaleString() }}
              </td>
              <td
                class="text-right"
                :class="(h.unrealizedGain || 0) >= 0 ? 'text-success' : 'text-error'"
              >
                {{ (h.unrealizedGain || 0) >= 0 ? '+' : ''
                }}{{ (h.unrealizedGain || 0).toLocaleString() }}
              </td>
              <td
                class="text-right"
                :class="(h.unrealizedGainPercent || 0) >= 0 ? 'text-success' : 'text-error'"
              >
                {{ (h.unrealizedGainPercent || 0) >= 0 ? '+' : ''
                }}{{ (h.unrealizedGainPercent || 0).toFixed(2) }}%
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
