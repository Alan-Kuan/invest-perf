<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useDatabase } from '../composables/useDatabase';
import { useTransactions } from '../composables/useTransactions';
import { useDividends, type YearlyStat } from '../composables/useDividends';
import { usePortfolio } from '../composables/usePortfolio';
import { useStockPrice } from '../composables/useStockPrice';
import { Chart } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

const { isReady, query, execute } = useDatabase();
const { transactions, loadTransactions } = useTransactions();
const { dividends, loadDividends, getYearlyStats } = useDividends();
const { getPortfolioSummary, getRealizedGain } = usePortfolio();
const { fetchHistoricalPrice } = useStockPrice();

const isLoading = ref(false);

interface PerformanceStats {
  realizedGain: number;
  unrealizedGain: number;
  totalDividend: number;
  totalReturn: number;
  buyCount: number;
  sellCount: number;
  winCount: number;
  loseCount: number;
}

const stats = ref<PerformanceStats>({
  realizedGain: 0,
  unrealizedGain: 0,
  totalDividend: 0,
  totalReturn: 0,
  buyCount: 0,
  sellCount: 0,
  winCount: 0,
  loseCount: 0
});

interface AnnualData {
  year: number;
  realizedReturnRate: number;
  unrealizedReturnRate: number;
  totalReturnRate: number;
}

const yearlyDividends = ref<YearlyStat[]>([]);
const annualPerformance = ref<AnnualData[]>([]);

const loadStats = async () => {
  loadTransactions({ sortOrder: 'ASC' });
  loadDividends({ sortOrder: 'ASC' });

  const summary = getPortfolioSummary();

  stats.value.realizedGain = getRealizedGain();
  stats.value.unrealizedGain = summary.totalUnrealized;
  stats.value.totalDividend = dividends.value.reduce((sum, d) => sum + d.amount, 0);
  stats.value.totalReturn = stats.value.realizedGain + stats.value.totalDividend + summary.totalUnrealized;
  stats.value.buyCount = transactions.value.filter(t => t.type === 'buy').length;
  stats.value.sellCount = transactions.value.filter(t => t.type === 'sell').length;

  yearlyDividends.value = getYearlyStats();

  await checkAndRecalculate();
};

const handleRefresh = async () => {
  isLoading.value = true;
  await loadAnnualPerformance();
  isLoading.value = false;
};

  const loadAnnualPerformance = async () => {
  if (transactions.value.length === 0) return;

  const firstYear = parseInt(transactions.value[0].date.substring(0, 4));
  const currentYear = parseInt(new Date().getFullYear().toString());

  const stockYearlyData = new Map<number, Map<string, {
    totalCost: number;
    boughtShares: number;
    totalProceeds: number;
    soldShares: number;
  }>>();

  for (const t of transactions.value) {
    const year = parseInt(t.date.substring(0, 4));

    if (!stockYearlyData.has(year)) {
      stockYearlyData.set(year, new Map());
    }

    const yearData = stockYearlyData.get(year)!;

    if (!yearData.has(t.ticker)) {
      yearData.set(t.ticker, {
        totalCost: 0,
        boughtShares: 0,
        totalProceeds: 0,
        soldShares: 0
      });
    }

    const stockData = yearData.get(t.ticker)!;

    if (t.type === 'buy') {
      stockData.totalCost += t.net_amount;
      stockData.boughtShares += t.shares;
    } else if (t.type === 'sell') {
      stockData.totalProceeds += t.net_amount;
      stockData.soldShares += t.shares;
    }
  }

  const annualDataList: AnnualData[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (let year = firstYear; year <= currentYear; year++) {
    if (!stockYearlyData.has(year)) {
      annualDataList.push({
        year,
        realizedReturnRate: 0,
        unrealizedReturnRate: 0,
        totalReturnRate: 0
      });
      continue;
    }

    const yearNext = year + 1;
    let realizedReturnRate = 0;
    let unrealizedReturnRate = 0;
    let totalReturnRate = 0;
    let realizedTotalCost = 0;
    let unrealizedTotalCost = 0;

    const yearData = stockYearlyData.get(year)!;

    for (const [ticker, data] of yearData) {
      const avgPrice = data.totalCost / data.boughtShares;
      const lastDay = year == currentYear ? today : `${year}-12-31`;
      const lastDayPrice = await fetchHistoricalPrice(ticker, lastDay) || 0;
      const remainingShares = data.boughtShares - data.soldShares;

      const realizedGain = data.totalProceeds - data.soldShares * avgPrice;
      const unrealizedGain = remainingShares * (lastDayPrice - avgPrice);

      realizedReturnRate += realizedGain;
      unrealizedReturnRate += unrealizedGain;
      realizedTotalCost += data.soldShares * avgPrice;
      unrealizedTotalCost += remainingShares * avgPrice;

      if (remainingShares == 0) continue;

      if (!stockYearlyData.has(yearNext)) {
        stockYearlyData.set(yearNext, new Map());
      }

      const yearNextData = stockYearlyData.get(yearNext)!;

      if (!yearNextData.has(ticker)) {
        yearNextData.set(ticker, {
          totalCost: 0,
          boughtShares: 0,
          totalProceeds: 0,
          soldShares: 0
        });
      }

      const dataNextYear = yearNextData.get(ticker)!;

      dataNextYear.totalCost += remainingShares * lastDayPrice;
      dataNextYear.boughtShares += remainingShares;
    }

    totalReturnRate = (realizedReturnRate + unrealizedReturnRate) / (realizedTotalCost + unrealizedTotalCost);
    realizedReturnRate = realizedTotalCost > 0 ? realizedReturnRate / realizedTotalCost : 0;
    unrealizedReturnRate = unrealizedTotalCost > 0 ? unrealizedReturnRate / unrealizedTotalCost : 0;

    annualDataList.push({
      year,
      realizedReturnRate,
      unrealizedReturnRate,
      totalReturnRate
    });
  }

  annualPerformance.value = annualDataList;
  await saveAnnualPerformanceCache(annualPerformance.value);
};

const loadAnnualPerformanceCache = async (): Promise<AnnualData[]> => {
  const cached = query('SELECT * FROM annual_performance ORDER BY year ASC LIMIT 5') as {
    year: number;
    realized_return_rate: number;
    unrealized_return_rate: number;
  }[];

  if (cached.length === 0) return [];

  return cached.map(c => ({
    year: c.year,
    realizedReturnRate: c.realized_return_rate,
    unrealizedReturnRate: c.unrealized_return_rate,
    totalReturnRate: c.realized_return_rate + c.unrealized_return_rate
  }));
};

const saveAnnualPerformanceCache = async (data: AnnualData[]): Promise<void> => {
  for (const d of data) {
    execute(
      `INSERT OR REPLACE INTO annual_performance
       (year, realized_return_rate, unrealized_return_rate, calculated_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [d.year, d.realizedReturnRate || 0, d.unrealizedReturnRate || 0]
    );
  }
};

const checkAndRecalculate = async (): Promise<void> => {
  const currentYear = new Date().getFullYear();
  const cached = query('SELECT * FROM annual_performance WHERE year = ?', [currentYear]) as { year: number; calculated_at: string }[];

  const latestTransaction = query('SELECT MAX(date) as max_date FROM transactions') as { max_date: string }[];
  const latestDividend = query('SELECT MAX(pay_date) as max_date FROM dividends') as { max_date: string }[];

  const latestDataDate = latestTransaction[0]?.max_date || '';
  const latestDividendDate = latestDividend[0]?.max_date || '';

  let needRecalculate = false;

  if (cached.length === 0) {
    needRecalculate = true;
  } else {
    const cachedDate = cached[0].calculated_at;
    if (latestDataDate > cachedDate || latestDividendDate > cachedDate) {
      needRecalculate = true;
    }
  }

  if (needRecalculate) {
    await loadAnnualPerformance();
  } else {
    const cachedData = await loadAnnualPerformanceCache();
    if (cachedData.length > 0) {
      annualPerformance.value = cachedData;
    }
  }
};

const performanceChartData = computed(() => ({
  labels: annualPerformance.value.map(a => a.year),
  datasets: [
    {
      label: '總報酬率',
      data: annualPerformance.value.map(a => a.totalReturnRate * 100),
      backgroundColor: '#4caf50',
      borderRadius: 4,
      barPercentage: 0.6
    },
    {
      label: '已實現',
      data: annualPerformance.value.map(a => a.realizedReturnRate * 100),
      backgroundColor: '#2196f3',
      borderRadius: 4,
      barPercentage: 0.6
    },
    {
      label: '未實現',
      data: annualPerformance.value.map(a => a.unrealizedReturnRate * 100),
      backgroundColor: '#ff9800',
      borderRadius: 4,
      barPercentage: 0.6
    }
  ]
}));

const performanceChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const
    },
    tooltip: {
      callbacks: {
        label: (context: any) => {
          return [
            `${context.dataset.label}: ${context.raw?.toFixed(2)}%`
          ];
        }
      }
    }
  },
  scales: {
    x: {
      grid: {
        display: false
      }
    },
    y: {
      ticks: {
        callback: (value: number | string) => Number(value).toFixed(1) + '%'
      }
    }
  }
};

watch(isReady, (ready) => {
  if (ready) {
    loadStats();
  }
});

onMounted(() => {
  if (isReady.value) {
    loadStats();
  }
});
</script>

<template>
  <div>
    <h2 class="text-headline-small mb-4">投資績效</h2>

    <v-row class="mb-4" align="stretch">
      <v-col v-for="i in 5" :key="i" sm="6" md="4" lg="2" class="d-flex align-stretch">
        <v-card class="rounded-lg w-100" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-text class="h-100">
            <template v-if="i === 1">
              <div class="text-body-small text-grey">已實現損益</div>
              <div class="text-body-large font-weight-bold" :class="stats.realizedGain >= 0 ? 'text-success' : 'text-error'">
                {{ stats.realizedGain >= 0 ? '+' : '' }}{{ stats.realizedGain.toLocaleString() }}
              </div>
            </template>
            <template v-else-if="i === 2">
              <div class="text-body-small text-grey">未實現損益</div>
              <div class="text-body-large font-weight-bold" :class="stats.unrealizedGain >= 0 ? 'text-success' : 'text-error'">
                {{ stats.unrealizedGain >= 0 ? '+' : '' }}{{ stats.unrealizedGain.toLocaleString() }}
              </div>
            </template>
            <template v-else-if="i === 3">
              <div class="text-body-small text-grey">股利收入</div>
              <div class="text-body-large font-weight-bold text-success">{{ stats.totalDividend.toLocaleString() }}</div>
            </template>
            <template v-else-if="i === 4">
              <div class="text-body-small text-grey">總損益</div>
              <div class="text-body-large font-weight-bold" :class="stats.totalReturn >= 0 ? 'text-success' : 'text-error'">
                {{ stats.totalReturn >= 0 ? '+' : '' }}{{ stats.totalReturn.toLocaleString() }}
              </div>
            </template>
            <template v-else-if="i === 5">
              <div class="text-body-small text-grey">交易次數</div>
              <div class="text-body-large font-weight-bold">{{ stats.buyCount + stats.sellCount }}</div>
              <div class="text-body-small text-grey">{{ stats.buyCount }} 買 / {{ stats.sellCount }} 賣</div>
            </template>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="6">
        <v-card class="mb-4 rounded-lg" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-item>
            <div class="d-flex align-center">
              <span class="text-base font-semibold">年度報酬率</span>
              <v-tooltip origin="start center" transition="scale-transition">
                <template v-slot:activator="{ props }">
                  <v-icon v-bind="props" size="small" class="ml-1" color="grey">mdi-help-circle-outline</v-icon>
                </template>
                <ul class="ma-0 pa-2">
                  <li>已實現報酬率 = Σ(((股票賣出價 - 股票買入均價) × 賣出股數)) / Σ(股票買入均價 × 賣出股數) × 100%</li>
                  <li>未實現報酬率 = Σ(((年末剩餘股票收盤價 - 股票買入均價) × 剩餘股數)) / Σ(股票買入均價 × 剩餘股數) × 100%</li>
                  <li>剩餘股票以當年年末收盤價作為成本價留到隔年繼續計算</li>
                  <li>已考量手續費和交易稅</li>
                </ul>
              </v-tooltip>
            </div>
            <template v-slot:append>
              <v-btn
                icon
                size="small"
                variant="text"
                :loading="isLoading"
                @click="handleRefresh"
              >
                <v-icon size="small">mdi-refresh</v-icon>
              </v-btn>
            </template>
          </v-card-item>
          <v-card-text>
            <div style="height: 250px">
              <Chart
                v-if="annualPerformance.length > 0"
                type="bar"
                :data="performanceChartData"
                :options="performanceChartOptions"
              />
              <div v-else class="d-flex align-center justify-center h-100 text-grey">尚無資料</div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>
