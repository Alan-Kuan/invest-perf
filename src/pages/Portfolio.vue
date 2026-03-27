<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useDatabase } from '../composables/useDatabase';
import { usePortfolio, type Holding } from '../composables/usePortfolio';
import { useStockPrice } from '../composables/useStockPrice';

const { isReady } = useDatabase();
const { updatePrice, getPortfolioSummary } = usePortfolio();
const { fetchPricesBatch } = useStockPrice();

interface PortfolioSummary {
  holdings: Holding[];
  totalCost: number;
  totalValue: number;
  totalUnrealized: number;
  totalGain: number;
  realizedGain: number;
}

const summary = ref<PortfolioSummary>({
  holdings: [],
  totalCost: 0,
  totalValue: 0,
  totalUnrealized: 0,
  totalGain: 0,
  realizedGain: 0
});

const editingPrice = ref<string | null>(null);
const newPrice = ref('');
const isLoadingPrices = ref(false);
const lastUpdate = ref<string | null>(null);

const loadData = () => {
  summary.value = getPortfolioSummary();
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

const startEditPrice = (ticker: string, currentPrice?: number) => {
  editingPrice.value = ticker;
  newPrice.value = currentPrice?.toString() || '';
};

const savePrice = (ticker: string) => {
  const price = parseFloat(newPrice.value);
  if (price > 0) {
    updatePrice(ticker, price);
    loadData();
  }
  editingPrice.value = null;
  newPrice.value = '';
};

const cancelEdit = () => {
  editingPrice.value = null;
  newPrice.value = '';
};

watch(isReady, (ready) => {
  if (ready) {
    loadData();
  }
});

onMounted(() => {
  if (isReady.value) {
    loadData();
  }
});
</script>

<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-4">
      <h2 class="text-h4">投資組合</h2>
      <div class="d-flex align-center">
        <span v-if="lastUpdate" class="text-grey mr-4">更新時間: {{ lastUpdate }}</span>
        <v-btn
          color="primary"
          :loading="isLoadingPrices"
          @click="fetchAllPrices"
          :disabled="summary.holdings.length === 0"
        >
          更新報價
        </v-btn>
      </div>
    </div>

    <v-row class="mb-4" align="stretch">
      <v-col sm="6" md="4" lg="2">
        <v-card class="rounded-xl h-full" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-text>
            <div class="text-caption text-grey">總成本</div>
            <div class="text-xl font-weight-bold">{{ summary.totalCost.toLocaleString() }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col sm="6" md="4" lg="2">
        <v-card class="rounded-xl h-full" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-text>
            <div class="text-caption text-grey">總市值</div>
            <div class="text-xl font-weight-bold">{{ summary.totalValue.toLocaleString() }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col sm="6" md="4" lg="2">
        <v-card class="rounded-xl h-full" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-text>
            <div class="text-caption text-grey">未實現損益</div>
            <div class="text-xl font-weight-bold" :class="summary.totalUnrealized >= 0 ? 'text-success' : 'text-error'">
              {{ summary.totalUnrealized >= 0 ? '+' : '' }}{{ summary.totalUnrealized.toLocaleString() }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col sm="6" md="4" lg="2">
        <v-card class="rounded-xl h-full" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-text>
            <div class="text-caption text-grey">已實現損益</div>
            <div class="text-xl font-weight-bold" :class="summary.realizedGain >= 0 ? 'text-success' : 'text-error'">
              {{ summary.realizedGain >= 0 ? '+' : '' }}{{ summary.realizedGain.toLocaleString() }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col sm="12" md="4" lg="2">
        <v-card class="rounded-xl h-full" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-text>
            <div class="text-caption text-grey">總損益</div>
            <div class="text-xl font-weight-bold" :class="summary.totalGain >= 0 ? 'text-success' : 'text-error'">
              {{ summary.totalGain >= 0 ? '+' : '' }}{{ summary.totalGain.toLocaleString() }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card class="rounded-xl" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
      <v-card-title class="text-base font-semibold pb-2">持有部位</v-card-title>
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
              <th class="text-left font-semibold text-grey-darken-1">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in summary.holdings" :key="h.ticker">
              <td class="font-weight-bold">{{ h.ticker }}</td>
              <td>{{ h.name || '-' }}</td>
              <td class="text-right">{{ h.shares.toLocaleString() }}</td>
              <td class="text-right">{{ h.avg_cost?.toLocaleString() }}</td>
              <td class="text-right">{{ h.total_cost?.toLocaleString() }}</td>
              <td class="text-right">
                <v-text-field
                  v-if="editingPrice === h.ticker"
                  v-model="newPrice"
                  type="number"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="price-input"
                  @keyup.enter="savePrice(h.ticker)"
                  @keyup.escape="cancelEdit"
                />
                <span
                  v-else
                  class="editable-price"
                  @click="startEditPrice(h.ticker, h.currentPrice)"
                >
                  {{ h.currentPrice?.toLocaleString() || '點擊設定' }}
                </span>
              </td>
              <td class="text-right">
                {{ ((h.currentPrice || h.avg_cost) * h.shares).toLocaleString() }}
              </td>
              <td
                class="text-right"
                :class="(h.unrealizedGain || 0) >= 0 ? 'text-success' : 'text-error'"
              >
                {{ (h.unrealizedGain || 0) >= 0 ? '+' : '' }}{{ (h.unrealizedGain || 0).toLocaleString() }}
              </td>
              <td
                class="text-right"
                :class="(h.unrealizedGainPercent || 0) >= 0 ? 'text-success' : 'text-error'"
              >
                {{ (h.unrealizedGainPercent || 0) >= 0 ? '+' : '' }}{{ (h.unrealizedGainPercent || 0).toFixed(2) }}%
              </td>
              <td>
                <v-btn
                  v-if="editingPrice === h.ticker"
                  color="success"
                  size="small"
                  variant="text"
                  @click="savePrice(h.ticker)"
                >
                  儲存
                </v-btn>
                <v-btn
                  v-if="editingPrice === h.ticker"
                  color="grey"
                  size="small"
                  variant="text"
                  @click="cancelEdit"
                >
                  取消
                </v-btn>
              </td>
            </tr>
            <tr v-if="summary.holdings.length === 0">
              <td colspan="10" class="text-center text-grey pa-4">尚無持有部位</td>
            </tr>
          </tbody>
        </v-table>
        <div class="text-caption text-grey mt-2">* 系統會自動抓取 TWSE 即時報價，或點擊現價手動設定</div>
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped>
.summary-highlight {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.summary-highlight .text-caption {
  color: #aaa;
}

.editable-price {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.editable-price:hover {
  background: #e3f2fd;
}

.price-input {
  max-width: 100px;
}
</style>
