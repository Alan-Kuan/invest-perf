<script setup lang="ts">
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
  type Plugin,
  type TooltipItem,
} from 'chart.js';
import { onUnmounted, ref, watch } from 'vue';
import { Doughnut } from 'vue-chartjs';

import { useDatabase } from '../composables/useDatabase';
import { usePortfolio, type PortfolioSummary } from '../composables/usePortfolio';
import {
  loadCurrentPriceTimestamps,
  shouldRefreshCurrentPriceCache,
} from '../composables/useStockPrice';
import { getChartColorPalette } from '../utils/chart-colors';
import { MARKET_OPTIONS, type Market } from '../utils/market';

ChartJS.register(ArcElement, Tooltip, Legend);

type DistributionMetric = 'cost' | 'value';

const percentageLabelPlugin: Plugin<'doughnut'> = {
  id: 'percentageLabel',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const dataset = chart.data.datasets[0];
    if (!dataset) return;

    const values = dataset.data.map(value => Number(value) || 0);
    const total = values.reduce((sum, value) => sum + value, 0);

    if (total <= 0) return;

    ctx.save();
    ctx.font = '600 12px sans-serif';
    ctx.fillStyle = '#262626';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    chart.getDatasetMeta(0).data.forEach((element, index) => {
      const value = values[index] ?? 0;
      const ratio = (value / total) * 100;

      if (ratio < 4) return;

      const position = element.tooltipPosition(true);
      if (position.x === null || position.y === null) return;

      ctx.strokeText(`${ratio.toFixed(1)}%`, position.x, position.y);
      ctx.fillText(`${ratio.toFixed(1)}%`, position.x, position.y);
    });

    ctx.restore();
  },
};

const { is_ready } = useDatabase();
const { getPortfolioSummary } = usePortfolio();

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
  tw: null,
  us: null,
});

let price_update_interval: ReturnType<typeof setInterval> | null = null;

function startPriceUpdateTimer(): void {
  if (price_update_interval) return;

  price_update_interval = setInterval(
    () => {
      const markets_to_refresh = (['tw', 'us'] as Market[]).filter(
        market =>
          summaries.value[market].holdings.length > 0 && shouldRefreshCurrentPriceCache(market),
      );
      void Promise.all(markets_to_refresh.map(market => updateSummary(market, true)));
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

function getHoldingDistributionValue(
  summary: PortfolioSummary,
  metric: DistributionMetric,
  index: number,
): number {
  const holding = summary.holdings[index];
  if (!holding) return 0;

  return metric === 'cost' ? holding.total_cost : holding.total_value || 0;
}

function getDistributionColors(summary: PortfolioSummary): string[] {
  return getChartColorPalette(summary.holdings.length);
}

function getDistributionColor(summary: PortfolioSummary, index: number): string {
  return getDistributionColors(summary)[index] ?? '#d4d4d4';
}

function getDistributionChartData(
  summary: PortfolioSummary,
  metric: DistributionMetric,
): ChartData<'doughnut', number[], string> {
  return {
    labels: summary.holdings.map(holding => holding.name || holding.ticker),
    datasets: [
      {
        data: summary.holdings.map(holding =>
          metric === 'cost' ? holding.total_cost : holding.total_value || 0,
        ),
        backgroundColor: getDistributionColors(summary),
        borderColor: '#ffffff',
        borderWidth: 2,
      },
    ],
  };
}

function getDistributionChartOptions(
  summary: PortfolioSummary,
  metric: DistributionMetric,
  market: Market,
): ChartOptions<'doughnut'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'doughnut'>) => {
            const item = summary.holdings[ctx.dataIndex ?? 0];
            if (!item) return '';

            const label = item.name || item.ticker;
            const value = getHoldingDistributionValue(summary, metric, ctx.dataIndex ?? 0);
            const total = summary.holdings.reduce(
              (sum, _, index) => sum + getHoldingDistributionValue(summary, metric, index),
              0,
            );
            const ratio = total > 0 ? (value / total) * 100 : 0;
            return `${label} (${item.ticker}): ${formatAmount(value, market)} (${ratio.toFixed(
              1,
            )}%)`;
          },
        },
      },
    },
  };
}

async function updateSummary(market: Market, force = false): Promise<void> {
  if (is_loading_prices.value[market]) return;

  is_loading_prices.value[market] = true;

  try {
    summaries.value[market] = await getPortfolioSummary(market, { force });
    last_updates.value[market] = loadCurrentPriceTimestamps(market);
  } finally {
    is_loading_prices.value[market] = false;
  }
}

watch(
  is_ready,
  async ready => {
    if (!ready) return;

    await Promise.all((['tw', 'us'] as Market[]).map(market => updateSummary(market)));

    const markets_to_refresh = (['tw', 'us'] as Market[]).filter(shouldRefreshCurrentPriceCache);
    void Promise.all(markets_to_refresh.map(market => updateSummary(market, true)));
    startPriceUpdateTimer();
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
            @click="updateSummary(market.value, true)"
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
          <template v-if="summaries[market.value].holdings.length > 0">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="min-h-80">
                <div class="text-center text-sm font-medium text-neutral-500 mb-2">成本比例</div>
                <div class="h-72 md:h-80">
                  <Doughnut
                    :data="getDistributionChartData(summaries[market.value], 'cost')"
                    :options="
                      getDistributionChartOptions(summaries[market.value], 'cost', market.value)
                    "
                    :plugins="[percentageLabelPlugin]"
                  />
                </div>
              </div>
              <div class="min-h-80">
                <div class="text-center text-sm font-medium text-neutral-500 mb-2">現值比例</div>
                <div class="h-72 md:h-80">
                  <Doughnut
                    :data="getDistributionChartData(summaries[market.value], 'value')"
                    :options="
                      getDistributionChartOptions(summaries[market.value], 'value', market.value)
                    "
                    :plugins="[percentageLabelPlugin]"
                  />
                </div>
              </div>
            </div>

            <div class="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4 text-sm">
              <div
                v-for="(holding, index) in summaries[market.value].holdings"
                :key="holding.ticker"
                class="flex items-center min-w-0"
              >
                <span
                  class="inline-block w-3 h-3 rounded-sm mr-2 shrink-0"
                  :style="{ backgroundColor: getDistributionColor(summaries[market.value], index) }"
                ></span>
                <span class="truncate text-neutral-600">{{ holding.name || holding.ticker }}</span>
              </div>
            </div>
          </template>
          <div v-else class="h-80">
            <div class="flex items-center justify-center h-full text-neutral-400">尚無資料</div>
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
