<script setup lang="ts">
import { ref, onMounted, computed, watch, inject } from 'vue';

import StockSearch from '../components/StockSearch.vue';
import { useDatabase } from '../composables/useDatabase';
import { useDividends, type DividendInput } from '../composables/useDividends';
import { exportToCsv, parseCsv } from '../utils/csv';

const { is_ready } = useDatabase();
const { dividends, loadDividends, addDividend, deleteDividend, getAvailableYears } = useDividends();
const showSnackbar = inject<(text: string, color?: string) => void>('showSnackbar');
const showConfirm = inject<(message: string) => Promise<boolean>>('showConfirm');

const file_input = ref<HTMLInputElement | null>(null);
const import_loading = ref(false);

function exportCsv() {
  const data = dividends.value.map(d => ({
    發放日: d.pay_date,
    代號: d.ticker,
    名稱: d.name,
    類別: d.category === 'cash' ? '現金股利' : '股票股利',
    基準日持有股數: d.shares,
    每股股利: d.per_share,
    匯費: d.fee,
    實發股利: d.amount,
  }));
  const date = new Date().toISOString().split('T')[0];
  exportToCsv(data, `dividends-${date}.csv`);
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
      const pay_date = row['發放日'] || row['pay_date'] || row['發放日期'];
      const ticker = row['代號'] || row['ticker'];
      const category = row['類別'] || row['category'];
      const shares = parseInt(row['基準日持有股數'] || row['shares']);
      const per_share = parseFloat(row['每股股利'] || row['per_share']);
      const fee = parseFloat(row['匯費'] || row['fee'] || '0');

      if (pay_date && ticker && shares && per_share) {
        const input: DividendInput = {
          pay_date: normalizeDate(pay_date),
          ticker,
          name: row['名稱'] || row['name'] || '',
          category: category === '現金股利' || category === 'cash' ? 'cash' : 'stock',
          shares,
          per_share,
          fee,
        };
        addDividend(input);
        imported++;
      }
    }

    showSnackbar?.(`匯入成功：${imported} 筆`);
    loadDividends(filters.value);
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

function normalizeDate(date: string): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateToString(date: Date | string): string {
  if (!date) return '';
  if (typeof date === 'string') return date;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface DividendForm {
  pay_date: string;
  pay_date_picker: string;
  ticker: string;
  name: string;
  category: 'cash' | 'stock';
  shares: number | null;
  per_share: number | null;
  fee: number | null;
}

const form = ref<DividendForm>({
  pay_date: formatDateToString(new Date()),
  pay_date_picker: formatDateToString(new Date()),
  ticker: '',
  name: '',
  category: 'cash',
  shares: null,
  per_share: null,
  fee: null,
});

const date_menu = ref(false);

function updatePayDate(val: Date | string) {
  if (!val) return;
  const date_str = formatDateToString(val);
  if (date_str && date_str.length === 10) {
    form.value.pay_date = date_str;
    form.value.pay_date_picker = date_str;
  } else {
    form.value.pay_date_picker = date_str;
  }
}

function confirmDate() {
  updatePayDate(form.value.pay_date_picker);
  date_menu.value = false;
}

interface DividendFilters {
  ticker: string;
  name: string;
  category: string;
  year: string | null;
}

const filters = ref<DividendFilters>({
  ticker: '',
  name: '',
  category: '',
  year: null,
});

const computed_amount = computed(() => {
  const shares = form.value.shares || 0;
  const per_share = form.value.per_share || 0;
  const fee = form.value.fee || 0;
  return shares * per_share - fee;
});

function submitForm() {
  if (!form.value.pay_date || !form.value.ticker || !form.value.shares || !form.value.per_share) {
    showSnackbar?.('請填寫必填欄位', 'warning');
    return;
  }

  addDividend({
    pay_date: form.value.pay_date,
    ticker: form.value.ticker,
    name: form.value.name,
    category: form.value.category,
    shares: form.value.shares,
    per_share: form.value.per_share,
    fee: form.value.fee || 0,
  });

  form.value = {
    pay_date: formatDateToString(new Date()),
    pay_date_picker: formatDateToString(new Date()),
    ticker: '',
    name: '',
    category: 'cash',
    shares: null,
    per_share: null,
    fee: null,
  };

  loadDividends(filters.value);
}

function applyFilters() {
  loadDividends(filters.value);
}

function clearFilters() {
  filters.value = { ticker: '', name: '', category: '', year: null };
  loadDividends();
}

async function handleDelete(id: string) {
  if (await showConfirm?.('確定要刪除這筆紀錄嗎？')) {
    deleteDividend(id);
    loadDividends(filters.value);
  }
}

const total_dividend = computed(() => {
  return dividends.value.reduce((sum, d) => sum + d.amount, 0);
});

const total_cash = computed(() => {
  return dividends.value.filter(d => d.category === 'cash').reduce((sum, d) => sum + d.amount, 0);
});

const total_stock = computed(() => {
  return dividends.value
    .filter(d => d.category === 'stock')
    .reduce((sum, d) => sum + d.shares * d.per_share, 0);
});

const available_years = ref<string[]>([]);

const loadAvailableYears = () => {
  if (is_ready.value) {
    available_years.value = getAvailableYears();
  }
};

watch(is_ready, ready => {
  if (ready) {
    loadDividends();
    loadAvailableYears();
  }
});

onMounted(() => {
  if (is_ready.value) {
    loadDividends();
    loadAvailableYears();
  }
});
</script>

<template>
  <div>
    <h2 class="text-headline-small mb-4">股利紀錄</h2>

    <v-card class="mb-4 rounded-lg" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
      <v-card-item class="text-base font-semibold pb-2">新增股利</v-card-item>
      <v-card-text>
        <v-form @submit.prevent="submitForm">
          <v-row>
            <v-col cols="12" sm="6" md="3">
              <v-menu v-model="date_menu" :close-on-content-click="false" :close-on-esc="false">
                <template #activator="{ props }">
                  <v-text-field
                    v-model="form.pay_date"
                    label="發放日"
                    variant="outlined"
                    density="compact"
                    readonly
                    v-bind="props"
                  />
                </template>
                <v-date-picker v-model="form.pay_date_picker" hide-title color="primary">
                  <template #actions>
                    <v-btn text color="primary" @click="confirmDate"> 確認 </v-btn>
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
                v-model="form.category"
                :items="[
                  { title: '現金股利', value: 'cash' },
                  { title: '股票股利', value: 'stock' },
                ]"
                label="類別"
                variant="outlined"
                density="compact"
              />
            </v-col>

            <v-col cols="12" sm="6" md="3">
              <v-text-field
                v-model="form.shares"
                label="基準日持有股數"
                type="number"
                variant="outlined"
                density="compact"
              />
            </v-col>

            <v-col cols="12" sm="6" md="3">
              <v-text-field
                v-model="form.per_share"
                label="每股股利"
                type="number"
                step="0.01"
                variant="outlined"
                density="compact"
              />
            </v-col>

            <v-col sm="6" md="3">
              <v-text-field
                v-model="form.fee"
                label="匯費"
                type="number"
                variant="outlined"
                density="compact"
              />
            </v-col>

            <v-col class="d-flex justify-end align-center">
              <div class="d-flex align-baseline mr-6">
                <div class="mr-2 text-grey text-body-large">實發股利</div>
                <div
                  :class="computed_amount === 0 ? 'text-grey' : 'text-success'"
                  class="text-body-extra-large font-weight-bold"
                >
                  {{ computed_amount === 0 ? '$' : '+$' }}{{ computed_amount.toLocaleString() }}
                </div>
              </div>

              <v-btn type="submit" color="primary"> 新增 </v-btn>
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>
    </v-card>

    <v-card class="rounded-lg" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
      <v-card-item class="text-base font-semibold pb-2">股利歷史</v-card-item>
      <v-card-text>
        <v-row class="mb-4" align="stretch">
          <v-col sm="4">
            <v-card class="rounded-lg h-full" variant="tonal">
              <v-card-text>
                <div class="text-body-small">實發股利總計</div>
                <div class="text-body-large font-weight-bold text-success">
                  {{ total_dividend.toLocaleString() }}
                </div>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col sm="4">
            <v-card class="rounded-lg h-full" variant="tonal">
              <v-card-text>
                <div class="text-body-small">現金股利</div>
                <div class="text-body-large font-weight-bold">
                  {{ total_cash.toLocaleString() }}
                </div>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col sm="4">
            <v-card class="rounded-lg h-full" variant="tonal">
              <v-card-text>
                <div class="text-body-small">股票股利</div>
                <div class="text-body-large font-weight-bold">
                  {{ total_stock.toLocaleString() }}
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <v-row class="mb-4" align="center">
          <v-col sm="6" md="3">
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
          <v-col sm="6" md="3">
            <v-select
              v-model="filters.category"
              :items="[
                { title: '全部', value: '' },
                { title: '現金股利', value: 'cash' },
                { title: '股票股利', value: 'stock' },
              ]"
              label="類別"
              variant="outlined"
              density="compact"
              hide-details
              @update:model-value="applyFilters"
            />
          </v-col>
          <v-col sm="6" md="2">
            <v-select
              v-model="filters.year"
              :items="available_years"
              label="年度"
              variant="outlined"
              density="compact"
              hide-details
              @update:model-value="applyFilters"
            />
          </v-col>
          <v-col sm="6" md="4">
            <v-btn variant="outlined" @click="clearFilters">清除</v-btn>
          </v-col>
          <v-col sm="6" md="4" class="d-flex">
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
              style="display: none"
              @change="handleFileImport"
            />
          </v-col>
        </v-row>

        <v-table>
          <thead>
            <tr class="bg-grey-lighten-4">
              <th class="text-left font-semibold text-grey-darken-1">發放日</th>
              <th class="text-left font-semibold text-grey-darken-1">商品</th>
              <th class="text-center font-semibold text-grey-darken-1">類別</th>
              <th class="text-right font-semibold text-grey-darken-1">基準日持有股數</th>
              <th class="text-right font-semibold text-grey-darken-1">每股股利</th>
              <th class="text-right font-semibold text-grey-darken-1">匯費</th>
              <th class="text-right font-semibold text-grey-darken-1">實發股利</th>
              <th class="text-center font-semibold text-grey-darken-1">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in dividends" :key="d.id">
              <td>{{ formatDate(d.pay_date) }}</td>
              <td>
                <div class="font-weight-bold">{{ d.ticker }}</div>
                <div class="text-body-small text-grey">{{ d.name }}</div>
              </td>
              <td class="text-center">
                <v-chip
                  :color="d.category === 'cash' ? 'success' : 'orange'"
                  size="small"
                  class="text-xs"
                >
                  {{ d.category === 'cash' ? '現金' : '股票' }}
                </v-chip>
              </td>
              <td class="text-right">{{ d.shares.toLocaleString() }}</td>
              <td class="text-right">{{ d.per_share.toLocaleString() }}</td>
              <td class="text-right">{{ d.fee.toLocaleString() }}</td>
              <td class="text-right text-success">{{ d.amount.toLocaleString() }}</td>
              <td class="text-center">
                <v-btn color="error" size="small" variant="text" @click="handleDelete(d.id)">
                  刪除
                </v-btn>
              </td>
            </tr>
            <tr v-if="dividends.length === 0">
              <td colspan="8" class="text-center text-grey pa-4">尚無股利紀錄</td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>
  </div>
</template>
