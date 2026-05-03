<script setup lang="ts">
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { onUnmounted, ref, watch } from 'vue';
import { Doughnut } from 'vue-chartjs';

import { useDatabase } from '../composables/useDatabase';
import { usePortfolio, type PortfolioSummary } from '../composables/usePortfolio';
import { useStockPrice } from '../composables/useStockPrice';
import { MARKET_OPTIONS, type Market } from '../utils/market';

ChartJS.register(ArcElement, Tooltip, Legend);

const { is_ready } = useDatabase();
const { getPortfolioSummary, updateCurrPricesCache } = usePortfolio();
const { fetchPricesBatch } = useStockPrice();

function createEmptySummary(market: Market): PortfolioSummary {
  return {
    market,
    holdings: [],
    total_cost: 0,
    total_value: 0,
    realized_gain: 0,
    unrealized_gain: 0,
  };
}

const summaries = ref<Record<Market, PortfolioSummary>>({
  tw: createEmptySummary('tw'),
  us: createEmptySummary('us'),
});

const is_loading_prices = ref<Record<Market, boolean>>({
  tw: false,
  us: false,
});

const last_updates = ref<Record<Market, number | null>>({
  tw: loadLastUpdate('tw'),
  us: loadLastUpdate('us'),
});

let price_update_interval: ReturnType<typeof setInterval> | null = null;

const chart_colors = ['#00d9ff', '#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3', '#f38181'];

function loadLastUpdate(market: Market): number | null {
  const market_key = `price_last_update_${market}`;
  const legacy_key = market === 'tw' ? 'price_last_update' : '';
  const legacy_stored = legacy_key ? localStorage.getItem(legacy_key) : null;
  let stored = localStorage.getItem(market_key);

  if (!stored && legacy_stored) {
    stored = legacy_stored;
    localStorage.setItem(market_key, legacy_stored);
    localStorage.removeItem(legacy_key);
  }

  return stored ? parseInt(stored, 10) : null;
}

function saveLastUpdate(market: Market, ts: number): void {
  localStorage.setItem(`price_last_update_${market}`, ts.toString());
}

function isMarketHours(market: Market): boolean {
  const time_zone = market === 'us' ? 'America/New_York' : 'Asia/Taipei';
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: time_zone,
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);

  const weekday = parts.find(part => part.type === 'weekday')?.value || '';
  const hour = parseInt(parts.find(part => part.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(part => part.type === 'minute')?.value || '0', 10);
  const time_in_minutes = hour * 60 + minute;

  if (weekday === 'Sat' || weekday === 'Sun') return false;

  if (market === 'us') {
    return time_in_minutes >= 9 * 60 + 30 && time_in_minutes <= 16 * 60;
  }

  return time_in_minutes >= 9 * 60 && time_in_minutes <= 13 * 60 + 30;
}

function startPriceUpdateTimer(): void {
  if (price_update_interval) return;

  price_update_interval = setInterval(
    () => {
      const markets_to_refresh = (['tw', 'us'] as Market[]).filter(
        market => isMarketHours(market) && summaries.value[market].holdings.length > 0,
      );
      if (markets_to_refresh.length > 0) {
        void Promise.all(markets_to_refresh.map(market => fetchAllPrices(market)));
      }
    },
    5 * 60 * 1000,
  );
}

function stopPriceUpdateTimer(): void {
  if (price_update_interval) {
    clearInterval(price_update_interval);
    price_update_interval = null;
  }
}

function getPortfolioRoi(summary: PortfolioSummary): number | null {
  if (summary.total_cost <= 0) return null;
  return (summary.unrealized_gain / summary.total_cost) * 100;
}

function getLastUpdateDisplay(market: Market): string | null {
  const update_ts = last_updates.value[market];
  if (!update_ts) return null;
  return new Date(update_ts).toLocaleTimeString();
}

function formatAmount(value: number, market: Market): string {
  if (market === 'us') {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return value.toLocaleString();
}

function getDistributionChartData(summary: PortfolioSummary) {
  return {
    labels: summary.holdings.map(holding => holding.name || holding.ticker),
    datasets: [
      {
        data: summary.holdings.map(holding => holding.total_value || 0),
        backgroundColor: chart_colors,
      },
    ],
  };
}

function getDistributionChartOptions(summary: PortfolioSummary) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            const item = summary.holdings[ctx.dataIndex ?? 0];
            if (!item) return '';
            return `${item.name} (${item.ticker}): ${item.total_value?.toLocaleString()}`;
          },
        },
      },
    },
  };
}

async function fetchAllPrices(market: Market, force = false): Promise<void> {
  const summary = summaries.value[market];
  if (summary.holdings.length === 0) return;

  const now = Date.now();
  const last_ts = last_updates.value[market];
  if (!force && last_ts && !isMarketHours(market)) {
    const hours_since_update = (now - last_ts) / (1000 * 60 * 60);
    if (hours_since_update < 8) return;
  }

  is_loading_prices.value[market] = true;

  try {
    const tickers = summary.holdings.map(holding => holding.ticker);
    const prices = await fetchPricesBatch(tickers, market);
    updateCurrPricesCache(market, prices);
    summaries.value[market] = getPortfolioSummary(market);
    last_updates.value[market] = now;
    saveLastUpdate(market, now);
  } finally {
    is_loading_prices.value[market] = false;
  }
}

async function refreshAllMarkets(force = false): Promise<void> {
  await Promise.all(
    (['tw', 'us'] as Market[]).map(async market => {
      summaries.value[market] = getPortfolioSummary(market);
      await fetchAllPrices(market, force);
    }),
  );
}

watch(
  is_ready,
  async ready => {
    if (!ready) return;

    await refreshAllMarkets();
    if (isMarketHours('tw') || isMarketHours('us')) {
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
    </div>

    <div v-for="market in MARKET_OPTIONS" :key="market.value" class="mb-8">
      <div class="flex justify-between items-center mb-4">
        <div class="flex items-center gap-2">
          <h3 class="text-xl font-medium">{{ market.title }}</h3>
          <v-chip size="x-small" variant="tonal" color="primary" class="text-[11px]">
            {{ market.value === 'us' ? 'USD' : 'TWD' }}
          </v-chip>
        </div>
        <div class="flex items-center gap-3">
          <span v-if="getLastUpdateDisplay(market.value)" class="text-neutral-400 text-sm">
            更新時間: {{ getLastUpdateDisplay(market.value) }}
          </span>
          <v-btn
            variant="tonal"
            size="small"
            :loading="is_loading_prices[market.value]"
            @click="fetchAllPrices(market.value, true)"
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
                {{ formatAmount(summaries[market.value].total_cost, market.value) }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col sm="6" md="3">
          <v-card class="rounded-lg h-full shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <v-card-text>
              <div class="text-neutral-400">總現值</div>
              <div class="font-bold text-base">
                {{ formatAmount(summaries[market.value].total_value, market.value) }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col sm="6" md="3">
          <v-card class="rounded-lg h-full shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <v-card-text>
              <div class="flex items-center text-neutral-400">
                預估淨損益
                <v-tooltip text="台股考慮手續費與交易稅，美股不計">
                  <template #activator="{ props }">
                    <v-icon size="x-small" class="ml-1" v-bind="props">mdi-help-circle</v-icon>
                  </template>
                </v-tooltip>
              </div>
              <div
                class="font-bold text-base"
                :class="summaries[market.value].unrealized_gain >= 0 ? 'text-rise' : 'text-fall'"
              >
                {{ summaries[market.value].unrealized_gain >= 0 ? '+' : ''
                }}{{ formatAmount(summaries[market.value].unrealized_gain, market.value) }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col sm="6" md="3">
          <v-card class="rounded-lg h-full shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <v-card-text>
              <div class="text-neutral-400">預估報酬率</div>
              <div
                v-if="getPortfolioRoi(summaries[market.value]) !== null"
                class="font-bold text-base"
                :class="getPortfolioRoi(summaries[market.value])! >= 0 ? 'text-rise' : 'text-fall'"
              >
                {{ getPortfolioRoi(summaries[market.value])! >= 0 ? '+' : ''
                }}{{ getPortfolioRoi(summaries[market.value])!.toFixed(2) }}%
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
              v-if="summaries[market.value].holdings.length > 0"
              :data="getDistributionChartData(summaries[market.value])"
              :options="getDistributionChartOptions(summaries[market.value])"
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
                      <template #activator="{ props }">
                        <v-icon size="x-small" class="absolute right-0" v-bind="props">
                          mdi-help-circle
                        </v-icon>
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
                    <v-tooltip
                      text="台股考慮手續費（0.1425%）與交易稅（股票：0.3%、ETF：0.1%)，美股不計"
                    >
                      <template #activator="{ props }">
                        <v-icon size="x-small" class="absolute right-0" v-bind="props">
                          mdi-help-circle
                        </v-icon>
                      </template>
                    </v-tooltip>
                  </div>
                </th>
                <th class="text-right font-medium text-neutral-500">預估報酬率</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="holding in summaries[market.value].holdings" :key="holding.ticker">
                <td class="font-bold">{{ holding.ticker }}</td>
                <td>{{ holding.name || '-' }}</td>
                <td class="text-right">{{ holding.shares.toLocaleString() }}</td>
                <td class="text-right">
                  {{ formatAmount(holding.total_cost / holding.shares, market.value) }}
                </td>
                <td class="text-right">
                  {{ formatAmount(holding.total_cost, market.value) }}
                </td>
                <td class="text-right">
                  {{
                    holding.curr_price !== undefined
                      ? formatAmount(holding.curr_price, market.value)
                      : '-'
                  }}
                </td>
                <td class="text-right">
                  {{
                    holding.total_value !== undefined
                      ? formatAmount(holding.total_value, market.value)
                      : '-'
                  }}
                </td>
                <td
                  class="text-right"
                  :class="(holding.unrealized_gain ?? 0) >= 0 ? 'text-rise' : 'text-fall'"
                >
                  {{ (holding.unrealized_gain ?? 0) > 0 ? '+' : ''
                  }}{{ formatAmount(holding.unrealized_gain ?? 0, market.value) }}
                </td>
                <td
                  class="text-right"
                  :class="(holding.unrealized_roi ?? 0) >= 0 ? 'text-rise' : 'text-fall'"
                >
                  {{ (holding.unrealized_roi ?? 0) > 0 ? '+' : ''
                  }}{{ (holding.unrealized_roi ?? 0).toFixed(2) }}%
                </td>
              </tr>
              <tr v-if="summaries[market.value].holdings.length === 0">
                <td colspan="9" class="text-center text-neutral-400 pa-4">尚無持有部位</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>
