<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useDatabase } from '../composables/useDatabase';
import { useDividends } from '../composables/useDividends';
import StockSearch from '../components/StockSearch.vue';

const { isReady } = useDatabase();
const { dividends, loadDividends, addDividend, deleteDividend, getYearlyStats } = useDividends();

const formatDate = (date: string) => date ? date.replace(/-/g, '/') : '';

const formatDateToString = (date: Date | string): string => {
  if (!date) return '';
  if (typeof date === 'string') return date;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface DividendForm {
  payDate: string;
  payDatePicker: string;
  ticker: string;
  name: string;
  category: 'cash' | 'stock';
  shares: string;
  perShare: string;
  fee: string;
}

const form = ref<DividendForm>({
  payDate: formatDateToString(new Date()),
  payDatePicker: formatDateToString(new Date()),
  ticker: '',
  name: '',
  category: 'cash',
  shares: '',
  perShare: '',
  fee: ''
});

const dateMenu = ref(false);

const updatePayDate = (val: Date | string) => {
  if (!val) return;
  const dateStr = formatDateToString(val);
  if (dateStr && dateStr.length === 10) {
    form.value.payDate = dateStr;
    form.value.payDatePicker = dateStr;
  } else {
    form.value.payDatePicker = dateStr;
  }
};

const confirmDate = () => {
  updatePayDate(form.value.payDatePicker);
  dateMenu.value = false;
};

interface DividendFilters {
  ticker: string;
  category: string;
  year: string;
}

const filters = ref<DividendFilters>({
  ticker: '',
  category: '',
  year: ''
});

const computedAmount = computed(() => {
  const shares = parseFloat(form.value.shares) || 0;
  const perShare = parseFloat(form.value.perShare) || 0;
  const fee = parseFloat(form.value.fee) || 0;
  return shares * perShare - fee;
});

interface YearlyStat {
  year: string;
  cash_dividend: number;
  count: number;
}

const yearlyStats = ref<YearlyStat[]>([]);

const submitForm = () => {
  if (!form.value.payDate || !form.value.ticker || !form.value.shares || !form.value.perShare) {
    alert('請填寫必填欄位');
    return;
  }

  addDividend({
    payDate: form.value.payDate,
    ticker: form.value.ticker,
    name: form.value.name,
    category: form.value.category,
    shares: parseInt(form.value.shares),
    perShare: parseFloat(form.value.perShare),
    fee: parseFloat(form.value.fee) || 0
  });

  form.value = {
    payDate: formatDateToString(new Date()),
    payDatePicker: formatDateToString(new Date()),
    ticker: '',
    name: '',
    category: 'cash',
    shares: '',
    perShare: '',
    fee: ''
  };

  loadDividends(filters.value);
  loadYearlyStats();
};

const applyFilters = () => {
  loadDividends(filters.value);
};

const clearFilters = () => {
  filters.value = { ticker: '', category: '', year: '' };
  loadDividends();
};

const handleDelete = (id: string) => {
  if (confirm('確定要刪除這筆記錄嗎？')) {
    deleteDividend(id);
    loadDividends(filters.value);
    loadYearlyStats();
  }
};

const loadYearlyStats = () => {
  yearlyStats.value = getYearlyStats();
};

const totalDividend = computed(() => {
  return dividends.value.reduce((sum, d) => sum + d.amount, 0);
});

const totalCash = computed(() => {
  return dividends.value
    .filter(d => d.category === 'cash')
    .reduce((sum, d) => sum + d.amount, 0);
});

const totalStock = computed(() => {
  return dividends.value
    .filter(d => d.category === 'stock')
    .reduce((sum, d) => sum + d.shares * d.per_share, 0);
});

watch(isReady, (ready) => {
  if (ready) {
    loadDividends();
    loadYearlyStats();
  }
});

onMounted(() => {
  if (isReady.value) {
    loadDividends();
    loadYearlyStats();
  }
});
</script>

<template>
  <div>
    <h2 class="text-h4 mb-4">股利記錄</h2>

    <v-row class="mb-4" align="stretch">
      <v-col sm="4">
        <v-card class="rounded-xl h-full" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-text>
            <div class="text-caption text-grey">實發股利總計</div>
            <div class="text-xl font-weight-bold text-success">{{ totalDividend.toLocaleString() }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col sm="4">
        <v-card class="rounded-xl h-full" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-text>
            <div class="text-caption text-grey">現金股利</div>
            <div class="text-xl font-weight-bold">{{ totalCash.toLocaleString() }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col sm="4">
        <v-card class="rounded-xl h-full" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
          <v-card-text>
            <div class="text-caption text-grey">股票股利</div>
            <div class="text-xl font-weight-bold">{{ totalStock.toLocaleString() }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card class="mb-4 rounded-xl" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
      <v-card-title class="text-base font-semibold pb-2">新增股利</v-card-title>
      <v-card-text>
        <v-form @submit.prevent="submitForm">
          <v-row>
            <v-col cols="12" sm="6" md="3">
              <v-menu v-model="dateMenu" :close-on-content-click="false" :close-on-esc="false">
                <template #activator="{ props }">
                   <v-text-field
                     v-model="form.payDate"
                     label="發放日期"
                     variant="outlined"
                     density="compact"
                     readonly
                     v-bind="props"
                   />
                </template>
                <v-date-picker v-model="form.payDatePicker" hide-title color="primary">
                  <template #actions>
                    <v-btn
                      text
                      color="primary"
                      @click="confirmDate"
                    >
                      確認
                    </v-btn>
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
                 :items="[{ title: '現金股利', value: 'cash' }, { title: '股票股利', value: 'stock' }]"
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
                 v-model="form.perShare"
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

            <v-col class="flex justify-end items-center">
              <div class="flex items-end mr-6">
                <div class="mr-2 text-grey text-lg">實發股利</div>
                <div
                  :class="computedAmount === 0 ? 'text-grey' : 'text-success'"
                  class="text-2xl font-weight-bold"
                >
                  {{ computedAmount === 0 ? '$' : '+$' }}{{ computedAmount.toLocaleString() }}
                </div>
              </div>

              <v-btn type="submit" color="primary">
                新增
              </v-btn>
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>
    </v-card>

    <v-card class="rounded-xl" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
      <v-card-title class="text-base font-semibold pb-2">股利歷史</v-card-title>
      <v-card-text>
        <v-row class="mb-4" align="center">
          <v-col sm="6" md="3">
            <v-text-field
              v-model="filters.ticker"
              label="商品代號"
              variant="outlined"
              density="compact"
              hide-details
              @keyup.enter="applyFilters"
            />
          </v-col>
          <v-col sm="6" md="3">
            <v-select
              v-model="filters.category"
              :items="[{ title: '全部', value: '' }, { title: '現金股利', value: 'cash' }, { title: '股票股利', value: 'stock' }]"
              label="類別"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col sm="6" md="2">
            <v-text-field
              v-model="filters.year"
              label="年度"
              type="number"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col sm="6" md="4">
            <v-btn color="primary" @click="applyFilters" class="mr-2">篩選</v-btn>
            <v-btn variant="outlined" @click="clearFilters">清除</v-btn>
          </v-col>
        </v-row>

        <v-table>
          <thead>
            <tr class="bg-grey-lighten-4">
              <th class="text-left font-semibold text-grey-darken-1">發放日</th>
              <th class="text-left font-semibold text-grey-darken-1">商品</th>
              <th class="text-left font-semibold text-grey-darken-1">類別</th>
              <th class="text-right font-semibold text-grey-darken-1">持有股數</th>
              <th class="text-right font-semibold text-grey-darken-1">每股股利</th>
              <th class="text-right font-semibold text-grey-darken-1">匯費</th>
              <th class="text-right font-semibold text-grey-darken-1">實發股利</th>
              <th class="text-left font-semibold text-grey-darken-1">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in dividends" :key="d.id">
              <td>{{ formatDate(d.pay_date) }}</td>
              <td>
                <div class="font-weight-bold">{{ d.ticker }}</div>
                <div class="text-caption text-grey">{{ d.name }}</div>
              </td>
              <td>
                <v-chip :color="d.category === 'cash' ? 'success' : 'orange'" size="small" class="text-xs">
                  {{ d.category === 'cash' ? '現金' : '股票' }}
                </v-chip>
              </td>
              <td class="text-right">{{ d.shares.toLocaleString() }}</td>
              <td class="text-right">{{ d.per_share.toLocaleString() }}</td>
              <td class="text-right">{{ d.fee.toLocaleString() }}</td>
              <td class="text-right text-success">{{ d.amount.toLocaleString() }}</td>
              <td>
                <v-btn color="error" size="small" variant="text" @click="handleDelete(d.id)">
                  刪除
                </v-btn>
              </td>
            </tr>
            <tr v-if="dividends.length === 0">
              <td colspan="8" class="text-center text-grey pa-4">尚無股利記錄</td>
            </tr>
          </tbody>
        </v-table>

        <v-card v-if="yearlyStats.length > 0" variant="flat" class="mt-4 bg-grey-lighten-4 rounded-lg">
          <v-card-text>
            <div class="text-subtitle-2 mb-2">年度統計</div>
            <v-row>
              <v-col v-for="s in yearlyStats" :key="s.year" sm="4" md="2">
                <div class="text-caption text-grey">{{ s.year }}</div>
                <div class="text-h6 text-success">{{ String(s.cash_dividend).toLocaleString() }}</div>
                <div class="text-caption text-grey">{{ s.count }} 筆</div>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-card-text>
    </v-card>
  </div>
</template>
