<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useDatabase } from '../composables/useDatabase';
import { useTransactions } from '../composables/useTransactions';
import { useDividends, type YearlyStat } from '../composables/useDividends';
import { usePortfolio } from '../composables/usePortfolio';
import { Bar, Line, Doughnut } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
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
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const { isReady } = useDatabase();
const { transactions, loadTransactions } = useTransactions();
const { dividends, loadDividends, getYearlyStats } = useDividends();
const { getPortfolioSummary, getRealizedGain } = usePortfolio();

interface PerformanceStats {
  realizedGain: number;
  totalDividend: number;
  totalReturn: number;
  buyCount: number;
  sellCount: number;
  winCount: number;
  loseCount: number;
}

const stats = ref<PerformanceStats>({
  realizedGain: 0,
  totalDividend: 0,
  totalReturn: 0,
  buyCount: 0,
  sellCount: 0,
  winCount: 0,
  loseCount: 0
});

interface MonthlyData {
  month: string;
  amount: number;
}

interface DistributionData {
  ticker: string;
  value: number;
}

const yearlyDividends = ref<YearlyStat[]>([]);
const monthlyPerformance = ref<MonthlyData[]>([]);
const tickerDistribution = ref<DistributionData[]>([]);

const loadStats = () => {
  loadTransactions();
  loadDividends();

  const summary = getPortfolioSummary();

  stats.value.realizedGain = getRealizedGain();
  stats.value.totalDividend = dividends.value.reduce((sum, d) => sum + d.amount, 0);
  stats.value.totalReturn = stats.value.realizedGain + stats.value.totalDividend + summary.totalUnrealized;
  stats.value.buyCount = transactions.value.filter(t => t.type === 'buy').length;
  stats.value.sellCount = transactions.value.filter(t => t.type === 'sell').length;

  yearlyDividends.value = getYearlyStats();

  loadMonthlyPerformance();
  loadTickerDistribution();
};

const loadMonthlyPerformance = () => {
  const monthly: Record<string, number> = {};

  dividends.value.forEach(d => {
    const month = d.pay_date.substring(0, 7);
    monthly[month] = (monthly[month] || 0) + d.amount;
  });

  transactions.value.filter(t => t.type === 'sell').forEach(t => {
    const month = t.date.substring(0, 7);
    monthly[month] = (monthly[month] || 0) + t.net_amount;
  });

  monthlyPerformance.value = Object.entries(monthly)
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);
};

const loadTickerDistribution = () => {
  const holdings = getPortfolioSummary().holdings;

  tickerDistribution.value = holdings.map(h => ({
    ticker: h.ticker,
    value: h.total_cost
  }));
};

const performanceChartData = computed(() => ({
  labels: monthlyPerformance.value.map(m => m.month),
  datasets: [{
    label: '月度績效',
    data: monthlyPerformance.value.map(m => m.amount),
    backgroundColor: monthlyPerformance.value.map(m => m.amount >= 0 ? '#4caf50' : '#f44336'),
    borderRadius: 4
  }]
}));

const performanceChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false
    }
  },
  scales: {
    y: {
      beginAtZero: true
    }
  }
};

const cumulativeChartData = computed(() => {
  let cumulative = 0;
  const data = monthlyPerformance.value.map(m => {
    cumulative += m.amount;
    return cumulative;
  });

  return {
    labels: monthlyPerformance.value.map(m => m.month),
    datasets: [{
      label: '累計損益',
      data: data,
      borderColor: '#00d9ff',
      backgroundColor: 'rgba(0, 217, 255, 0.1)',
      fill: true,
      tension: 0.3
    }]
  };
});

const cumulativeChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false
    }
  },
  scales: {
    y: {
      beginAtZero: true
    }
  }
};

const distributionChartData = computed(() => ({
  labels: tickerDistribution.value.map(t => t.ticker),
  datasets: [{
    data: tickerDistribution.value.map(t => t.value),
    backgroundColor: [
      '#00d9ff',
      '#ff6b6b',
      '#4ecdc4',
      '#ffe66d',
      '#95e1d3',
      '#f38181',
      '#aa96da',
      '#fcbad3'
    ]
  }]
}));

const distributionChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right' as const
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
      <v-col v-for="i in 4" :key="i" sm="6" md="3" class="d-flex align-stretch">
        <v-card class="rounded-lg w-100" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-text class="h-100">
            <template v-if="i === 1">
              <div class="text-body-small text-grey">已實現損益</div>
              <div class="text-xl font-weight-bold" :class="stats.realizedGain >= 0 ? 'text-success' : 'text-error'">
                {{ stats.realizedGain >= 0 ? '+' : '' }}{{ stats.realizedGain.toLocaleString() }}
              </div>
            </template>
            <template v-else-if="i === 2">
              <div class="text-body-small text-grey">股利收入</div>
              <div class="text-xl font-weight-bold text-success">{{ stats.totalDividend.toLocaleString() }}</div>
            </template>
            <template v-else-if="i === 3">
              <div class="text-body-small text-grey">總損益</div>
              <div class="text-xl font-weight-bold" :class="stats.totalReturn >= 0 ? 'text-success' : 'text-error'">
                {{ stats.totalReturn >= 0 ? '+' : '' }}{{ stats.totalReturn.toLocaleString() }}
              </div>
            </template>
            <template v-else>
              <div class="text-body-small text-grey">交易次數</div>
              <div class="text-xl font-weight-bold">{{ stats.buyCount + stats.sellCount }}</div>
              <div class="text-body-small text-grey">{{ stats.buyCount }} 買 / {{ stats.sellCount }} 賣</div>
            </template>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col md="6">
        <v-card class="mb-4 rounded-lg" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-item class="text-base font-semibold pb-2">月度績效</v-card-item>
          <v-card-text>
            <div style="height: 250px">
              <Bar
                v-if="monthlyPerformance.length > 0"
                :data="performanceChartData"
                :options="performanceChartOptions"
              />
              <div v-else class="d-flex align-center justify-center h-100 text-grey">尚無資料</div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col md="6">
        <v-card class="mb-4 rounded-lg" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-item class="text-base font-semibold pb-2">累計損益曲線</v-card-item>
          <v-card-text>
            <div style="height: 250px">
              <Line
                v-if="monthlyPerformance.length > 0"
                :data="cumulativeChartData"
                :options="cumulativeChartOptions"
              />
              <div v-else class="d-flex align-center justify-center h-100 text-grey">尚無資料</div>
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

    <v-card v-if="yearlyDividends.length > 0" class="rounded-lg" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
      <v-card-item class="text-base font-semibold pb-2">歷年股利</v-card-item>
      <v-card-text>
        <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(120px, 1fr))">
          <div v-for="y in yearlyDividends" :key="y.year" class="bg-grey-lighten-4 p-4 rounded-lg">
            <div class="font-semibold text-grey-darken-3">{{ y.year }}</div>
            <div class="text-xl font-bold text-success">{{ String(y.cash_dividend).toLocaleString() }}</div>
            <div class="text-xs text-grey">{{ y.count }} 筆</div>
          </div>
        </div>
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
