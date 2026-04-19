<script setup lang="ts">
import { ref, onMounted, computed, watch, inject } from 'vue';

import StockSearch from '../components/StockSearch.vue';
import { useDatabase } from '../composables/useDatabase';
import { useStockList } from '../composables/useStockList';
import { useTransactions, type TransactionInput } from '../composables/useTransactions';
import { exportToCsv, parseCsv } from '../utils/csv';

const { is_ready } = useDatabase();
const { transactions, loadTransactions, addTransaction, deleteTransaction } = useTransactions();
const { loadStockList } = useStockList();
const showSnackbar = inject<(text: string, color?: string) => void>('showSnackbar');
const showConfirm = inject<(message: string) => Promise<boolean>>('showConfirm');

const file_input = ref<HTMLInputElement | null>(null);
const import_loading = ref(false);
const updating_stocks = ref(false);

async function updateStockList() {
  updating_stocks.value = true;
  await loadStockList();
  updating_stocks.value = false;
  showSnackbar?.('已更新商品代號資料庫');
}

function exportCsv() {
  const data = transactions.value.map(t => ({
    日期: t.date,
    代號: t.ticker,
    名稱: t.name,
    交易別: t.type === 'buy' ? '買進' : '賣出',
    股數: t.shares,
    單價: t.price,
    價金: t.total,
    手續費: t.fee,
    交易稅: t.tax,
    淨收付: t.net_amount,
  }));
  const date = new Date().toISOString().split('T')[0];
  exportToCsv(data, `transactions-${date}.csv`);
}

function triggerImport() {
  file_input.value?.click();
}

async function handleFileImport(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  import_loading.value = true;
  try {
    const text = await file.text();
    const rows = parseCsv(text);

    let imported = 0;
    for (const row of rows) {
      const date = row['日期'] || row['date'];
      const ticker = row['代號'] || row['ticker'];
      const type = row['交易別'] || row['type'];
      const shares = parseInt(row['股數'] || row['shares']);
      const price = parseFloat(row['單價'] || row['price']);
      const fee = parseFloat(row['手續費'] || row['fee'] || '0');
      const tax = parseFloat(row['交易稅'] || row['tax'] || '0');

      if (date && ticker && shares && price) {
        const input: TransactionInput = {
          date,
          ticker,
          name: row['名稱'] || row['name'] || '',
          type: type === '買進' || type === 'buy' ? 'buy' : 'sell',
          shares,
          price,
          fee,
          tax,
        };
        addTransaction(input);
        imported++;
      }
    }

    showSnackbar?.(`匯入成功：${imported} 筆`);
    loadTransactions(filters.value);
  } catch (e) {
    console.error('Import error:', e);
    showSnackbar?.('匯入失敗', 'error');
  } finally {
    import_loading.value = false;
    target.value = '';
  }
}

function formatDate(date: string) {
  return date ? date.replace(/-/g, '/') : '';
}

function formatDateToString(date: Date | string): string {
  if (!date) return '';
  if (typeof date === 'string') return date;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface TransactionForm {
  date: string;
  date_picker: string;
  ticker: string;
  name: string;
  type: 'buy' | 'sell';
  shares: string;
  price: string;
  fee: string;
  tax: string;
}

const form = ref<TransactionForm>({
  date: formatDateToString(new Date()),
  date_picker: formatDateToString(new Date()),
  ticker: '',
  name: '',
  type: 'buy',
  shares: '',
  price: '',
  fee: '',
  tax: '',
});

const date_menu = ref(false);
const start_date_menu = ref(false);
const end_date_menu = ref(false);

function updateFormDate(val: Date | string) {
  if (!val) return;
  const date_str = formatDateToString(val);
  if (date_str && date_str.length === 10) {
    form.value.date = date_str;
    form.value.date_picker = date_str;
  } else {
    form.value.date_picker = date_str;
  }
}

function confirmFormDate() {
  updateFormDate(form.value.date_picker);
  date_menu.value = false;
}

function adjustShares(delta: number) {
  const current = parseInt(form.value.shares) || 0;
  const new_val = current + delta;
  if (new_val > 0) {
    form.value.shares = String(new_val);
  }
}

interface TransactionFilters {
  ticker: string;
  name: string;
  type: string;
  start_date: string;
  start_date_picker: string;
  end_date: string;
  end_date_picker: string;
}

const filters = ref<TransactionFilters>({
  ticker: '',
  name: '',
  type: '',
  start_date: '',
  start_date_picker: '',
  end_date: '',
  end_date_picker: '',
});

function updateStartDate(val: Date | string) {
  if (!val) return;
  const date_str = formatDateToString(val);
  if (date_str && date_str.length === 10) {
    filters.value.start_date = date_str;
    filters.value.start_date_picker = date_str;
  } else {
    filters.value.start_date_picker = date_str;
  }
}

function confirmStartDate() {
  updateStartDate(filters.value.start_date_picker);
  start_date_menu.value = false;
  applyFilters();
}

function updateEndDate(val: Date | string) {
  if (!val) return;
  const date_str = formatDateToString(val);
  if (date_str && date_str.length === 10) {
    filters.value.end_date = date_str;
    filters.value.end_date_picker = date_str;
  } else {
    filters.value.end_date_picker = date_str;
  }
}

function confirmEndDate() {
  updateEndDate(filters.value.end_date_picker);
  end_date_menu.value = false;
  applyFilters();
}

const computed_total = computed(() => {
  const shares = parseFloat(form.value.shares) || 0;
  const price = parseFloat(form.value.price) || 0;
  return shares * price;
});

const computed_net_amount = computed(() => {
  const total = computed_total.value;
  const fee = parseFloat(form.value.fee) || 0;
  const tax = parseFloat(form.value.tax) || 0;

  if (form.value.type === 'buy') {
    return total + fee;
  } else {
    return total - fee - tax;
  }
});

function submitForm() {
  if (!form.value.date || !form.value.ticker || !form.value.shares || !form.value.price) {
    showSnackbar?.('請填寫必填欄位', 'warning');
    return;
  }

  addTransaction({
    date: form.value.date,
    ticker: form.value.ticker,
    name: form.value.name,
    type: form.value.type,
    shares: parseInt(form.value.shares),
    price: parseFloat(form.value.price),
    fee: parseFloat(form.value.fee) || 0,
    tax: parseFloat(form.value.tax) || 0,
  });

  form.value = {
    date: formatDateToString(new Date()),
    date_picker: formatDateToString(new Date()),
    ticker: '',
    name: '',
    type: 'buy',
    shares: '',
    price: '',
    fee: '',
    tax: '',
  };

  loadTransactions(filters.value);
}

function applyFilters() {
  loadTransactions(filters.value);
}

function clearFilters() {
  filters.value = {
    ticker: '',
    name: '',
    type: '',
    start_date: '',
    start_date_picker: '',
    end_date: '',
    end_date_picker: '',
  };
  loadTransactions();
}

async function handleDelete(id: string) {
  if (await showConfirm?.('確定要刪除這筆紀錄嗎？')) {
    deleteTransaction(id);
    loadTransactions(filters.value);
  }
}

watch(
  is_ready,
  ready => {
    if (!ready) return;
    loadTransactions();
  },
  { immediate: true },
);

onMounted(async () => {
  await loadStockList();
});
</script>

<template>
  <div>
    <div class="flex items-center mb-4">
      <h2 class="text-2xl">交易紀錄</h2>
      <v-btn
        class="ml-auto"
        variant="tonal"
        size="small"
        :loading="updating_stocks"
        @click="updateStockList"
      >
        更新商品代號資料庫
      </v-btn>
    </div>

    <v-card class="mb-4 rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <v-card-item class="font-medium pb-2">新增交易</v-card-item>
      <v-card-text>
        <v-form @submit.prevent="submitForm">
          <v-row>
            <v-col cols="12" sm="6" md="3">
              <v-menu v-model="date_menu" :close-on-content-click="false" :close-on-esc="false">
                <template #activator="{ props }">
                  <v-text-field
                    v-model="form.date"
                    label="成交日期"
                    variant="outlined"
                    density="compact"
                    readonly
                    v-bind="props"
                  />
                </template>
                <v-date-picker v-model="form.date_picker" hide-title color="primary">
                  <template #actions>
                    <v-btn text color="primary" @click="confirmFormDate"> 確認 </v-btn>
                  </template>
                </v-date-picker>
              </v-menu>
            </v-col>

            <v-col cols="12" sm="6" md="3">
              <StockSearch
                :ticker="form.ticker"
                :name="form.name"
                placeholder="輸入代號或名稱搜尋"
                @update:ticker="form.ticker = $event"
                @update:name="form.name = $event"
              />
            </v-col>

            <v-col cols="12" sm="6" md="3">
              <v-select
                v-model="form.type"
                :items="[
                  { title: '買進', value: 'buy' },
                  { title: '賣出', value: 'sell' },
                ]"
                label="交易別"
                variant="outlined"
                density="compact"
              />
            </v-col>

            <v-col cols="12" sm="6" md="3">
              <v-text-field
                v-model="form.shares"
                label="成交股數"
                type="number"
                variant="outlined"
                density="compact"
                min="1"
                hide-spin-buttons
              >
                <template #append-inner>
                  <div class="flex">
                    <v-btn size="small" color="success" variant="text" @click="adjustShares(1000)"
                      >+1K</v-btn
                    >
                    <v-btn size="small" color="success" variant="text" @click="adjustShares(100)"
                      >+100</v-btn
                    >
                    <v-btn size="small" color="error" variant="text" @click="adjustShares(-1000)"
                      >-1K</v-btn
                    >
                    <v-btn size="small" color="error" variant="text" @click="adjustShares(-100)"
                      >-100</v-btn
                    >
                  </div>
                </template>
              </v-text-field>
            </v-col>

            <v-col cols="12" sm="6" md="3">
              <v-text-field
                v-model="form.price"
                label="成交單價"
                type="number"
                step="0.01"
                variant="outlined"
                density="compact"
              />
            </v-col>

            <v-col cols="12" sm="6" md="3">
              <v-text-field
                :model-value="computed_total.toLocaleString()"
                label="成交價金"
                variant="outlined"
                density="compact"
                readonly
                bg-color="grey-lighten-4"
              />
            </v-col>

            <v-col cols="12" sm="6" md="3">
              <v-text-field
                v-model="form.fee"
                label="手續費"
                type="number"
                variant="outlined"
                density="compact"
              />
            </v-col>

            <v-col cols="12" sm="6" md="3">
              <v-text-field
                v-model="form.tax"
                label="交易稅"
                type="number"
                variant="outlined"
                density="compact"
                :disabled="form.type === 'buy'"
              />
            </v-col>
          </v-row>

          <v-row>
            <v-col class="flex justify-end items-center">
              <div class="flex items-baseline mr-6">
                <div class="mr-2 text-neutral-400 text-lg">淨收付</div>
                <div
                  :class="
                    computed_net_amount === 0
                      ? 'text-neutral-400'
                      : form.type === 'buy'
                        ? 'text-error'
                        : 'text-success'
                  "
                  class="text-xl font-bold"
                >
                  {{ computed_net_amount === 0 ? '$' : form.type === 'buy' ? '-$' : '+$'
                  }}{{ computed_net_amount.toLocaleString() }}
                </div>
              </div>

              <v-btn type="submit" color="primary"> 新增 </v-btn>
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>
    </v-card>

    <v-card class="rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <v-card-item class="font-medium pb-2">交易歷史</v-card-item>
      <v-card-text>
        <v-row class="mb-4" align="center">
          <v-col cols="12" sm="6" md="3">
            <StockSearch
              :ticker="filters.ticker"
              :name="filters.name"
              placeholder="輸入代號或名稱搜尋"
              @update:ticker="
                filters.ticker = $event;
                applyFilters();
              "
              @update:name="filters.name = $event"
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="filters.type"
              :items="[
                { title: '全部', value: '' },
                { title: '買進', value: 'buy' },
                { title: '賣出', value: 'sell' },
              ]"
              label="交易別"
              variant="outlined"
              density="compact"
              hide-details
              @update:model-value="applyFilters"
            />
          </v-col>
          <v-col cols="6" sm="3" md="2">
            <v-menu v-model="start_date_menu" :close-on-content-click="false" :close-on-esc="false">
              <template #activator="{ props }">
                <v-text-field
                  v-model="filters.start_date"
                  label="開始日期"
                  variant="outlined"
                  density="compact"
                  hide-details
                  readonly
                  v-bind="props"
                />
              </template>
              <v-date-picker v-model="filters.start_date_picker" hide-title color="primary">
                <template #actions>
                  <v-btn text color="primary" @click="confirmStartDate"> 確認 </v-btn>
                </template>
              </v-date-picker>
            </v-menu>
          </v-col>
          <v-col cols="6" sm="3" md="2">
            <v-menu v-model="end_date_menu" :close-on-content-click="false" :close-on-esc="false">
              <template #activator="{ props }">
                <v-text-field
                  v-model="filters.end_date"
                  label="結束日期"
                  variant="outlined"
                  density="compact"
                  hide-details
                  readonly
                  v-bind="props"
                />
              </template>
              <v-date-picker v-model="filters.end_date_picker" hide-title color="primary">
                <template #actions>
                  <v-btn text color="primary" @click="confirmEndDate"> 確認 </v-btn>
                </template>
              </v-date-picker>
            </v-menu>
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-btn variant="outlined" @click="clearFilters">清除</v-btn>
          </v-col>
          <v-col cols="12" sm="6" md="4" class="flex">
            <v-btn color="success" variant="outlined" @click="exportCsv" class="mr-2"
              >匯出 CSV</v-btn
            >
            <v-btn color="info" variant="outlined" @click="triggerImport" :loading="import_loading"
              >匯入 CSV</v-btn
            >
            <input
              ref="file_input"
              type="file"
              accept=".csv"
              class="hidden"
              @change="handleFileImport"
            />
          </v-col>
        </v-row>

        <v-table>
          <thead>
            <tr class="bg-neutral-100">
              <th class="text-left font-medium text-neutral-500">成交日期</th>
              <th class="text-left font-medium text-neutral-500">商品</th>
              <th class="text-center font-medium text-neutral-500">交易別</th>
              <th class="text-right font-medium text-neutral-500">股數</th>
              <th class="text-right font-medium text-neutral-500">單價</th>
              <th class="text-right font-medium text-neutral-500">價金</th>
              <th class="text-right font-medium text-neutral-500">手續費</th>
              <th class="text-right font-medium text-neutral-500">交易稅</th>
              <th class="text-right font-medium text-neutral-500">淨收付</th>
              <th class="text-center font-medium text-neutral-500">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in transactions" :key="t.id">
              <td>{{ formatDate(t.date) }}</td>
              <td>
                <div class="font-bold">{{ t.ticker }}</div>
                <div class="text-sm text-neutral-400">{{ t.name }}</div>
              </td>
              <td class="text-center">
                <v-chip :color="t.type === 'buy' ? 'info' : 'error'" size="small" class="text-sm">
                  {{ t.type === 'buy' ? '買進' : '賣出' }}
                </v-chip>
              </td>
              <td class="text-right">{{ t.shares.toLocaleString() }}</td>
              <td class="text-right">{{ t.price.toLocaleString() }}</td>
              <td class="text-right">{{ t.total.toLocaleString() }}</td>
              <td class="text-right">{{ t.fee.toLocaleString() }}</td>
              <td class="text-right">{{ t.tax.toLocaleString() }}</td>
              <td
                class="text-right"
                :class="
                  t.net_amount === 0
                    ? 'text-neutral-400'
                    : t.type === 'buy'
                      ? 'text-error'
                      : 'text-success'
                "
              >
                {{ t.net_amount === 0 ? '-' : t.type === 'buy' ? '-' : '+'
                }}{{ Math.abs(t.net_amount).toLocaleString() }}
              </td>
              <td class="text-center">
                <v-btn color="error" size="small" variant="text" @click="handleDelete(t.id)">
                  刪除
                </v-btn>
              </td>
            </tr>
            <tr v-if="transactions.length === 0">
              <td colspan="10" class="text-center text-neutral-400 pa-4">尚無交易紀錄</td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>
  </div>
</template>
