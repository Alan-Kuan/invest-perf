<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useDatabase } from '../composables/useDatabase';
import { useTransactions } from '../composables/useTransactions';
import StockSearch from '../components/StockSearch.vue';

const { isReady } = useDatabase();
const { transactions, loadTransactions, addTransaction, deleteTransaction } = useTransactions();

const formatDate = (date: string) => date ? date.replace(/-/g, '/') : '';

const formatDateToString = (date: Date | string): string => {
  if (!date) return '';
  if (typeof date === 'string') return date;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface TransactionForm {
  date: string;
  datePicker: string;
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
  datePicker: formatDateToString(new Date()),
  ticker: '',
  name: '',
  type: 'buy',
  shares: '',
  price: '',
  fee: '',
  tax: ''
});

const dateMenu = ref(false);
const startDateMenu = ref(false);
const endDateMenu = ref(false);

const updateFormDate = (val: Date | string) => {
  if (!val) return;
  const dateStr = formatDateToString(val);
  if (dateStr && dateStr.length === 10) {
    form.value.date = dateStr;
    form.value.datePicker = dateStr;
  } else {
    form.value.datePicker = dateStr;
  }
};

const confirmFormDate = () => {
  updateFormDate(form.value.datePicker);
  dateMenu.value = false;
};

const adjustShares = (delta: number) => {
  const current = parseInt(form.value.shares) || 0;
  const newValue = current + delta;
  if (newValue > 0) {
    form.value.shares = String(newValue);
  }
};

interface TransactionFilters {
  ticker: string;
  type: string;
  startDate: string;
  startDatePicker: string;
  endDate: string;
  endDatePicker: string;
}

const filters = ref<TransactionFilters>({
  ticker: '',
  type: '',
  startDate: '',
  startDatePicker: '',
  endDate: '',
  endDatePicker: ''
});

const updateStartDate = (val: Date | string) => {
  if (!val) return;
  const dateStr = formatDateToString(val);
  if (dateStr && dateStr.length === 10) {
    filters.value.startDate = dateStr;
    filters.value.startDatePicker = dateStr;
  } else {
    filters.value.startDatePicker = dateStr;
  }
};

const confirmStartDate = () => {
  updateStartDate(filters.value.startDatePicker);
  startDateMenu.value = false;
};

const updateEndDate = (val: Date | string) => {
  if (!val) return;
  const dateStr = formatDateToString(val);
  if (dateStr && dateStr.length === 10) {
    filters.value.endDate = dateStr;
    filters.value.endDatePicker = dateStr;
  } else {
    filters.value.endDatePicker = dateStr;
  }
};

const confirmEndDate = () => {
  updateEndDate(filters.value.endDatePicker);
  endDateMenu.value = false;
};

const computedTotal = computed(() => {
  const shares = parseFloat(form.value.shares) || 0;
  const price = parseFloat(form.value.price) || 0;
  return shares * price;
});

const computedNetAmount = computed(() => {
  const total = computedTotal.value;
  const fee = parseFloat(form.value.fee) || 0;
  const tax = parseFloat(form.value.tax) || 0;

  if (form.value.type === 'buy') {
    return total + fee;
  } else {
    return total - fee - tax;
  }
});

const submitForm = () => {
  if (!form.value.date || !form.value.ticker || !form.value.shares || !form.value.price) {
    alert('請填寫必填欄位');
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
    tax: parseFloat(form.value.tax) || 0
  });

  form.value = {
    date: formatDateToString(new Date()),
    datePicker: formatDateToString(new Date()),
    ticker: '',
    name: '',
    type: 'buy',
    shares: '',
    price: '',
    fee: '',
    tax: ''
  };

  loadTransactions(filters.value);
};

const applyFilters = () => {
  loadTransactions(filters.value);
};

const clearFilters = () => {
  filters.value = {
    ticker: '',
    type: '',
    startDate: '',
    startDatePicker: '',
    endDate: '',
    endDatePicker: ''
  };
  loadTransactions();
};

const handleDelete = (id: string) => {
  if (confirm('確定要刪除這筆記錄嗎？')) {
    deleteTransaction(id);
    loadTransactions(filters.value);
  }
};

watch(isReady, (ready) => {
  if (ready) {
    loadTransactions();
  }
});

onMounted(() => {
  if (isReady.value) {
    loadTransactions();
  }
});
</script>

<template>
  <div>
    <h2 class="text-h4 mb-4">交易記錄</h2>

    <v-card class="mb-4 rounded-lg" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
      <v-card-item class="text-base font-semibold pb-2">新增交易</v-card-item>
      <v-card-text>
        <v-form @submit.prevent="submitForm">
          <v-row>
            <v-col cols="12" sm="6" md="3">
              <v-menu v-model="dateMenu" :close-on-content-click="false" :close-on-esc="false">
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
                <v-date-picker v-model="form.datePicker" hide-title color="primary">
                  <template #actions>
                    <v-btn
                      text
                      color="primary"
                      @click="confirmFormDate"
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
                v-model="form.type"
                 :items="[{ title: '買進', value: 'buy' }, { title: '賣出', value: 'sell' }]"
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
                  <div class="d-flex">
                    <v-btn size="small" color="success" variant="text" @click="adjustShares(1000)">+1K</v-btn>
                    <v-btn size="small" color="success" variant="text" @click="adjustShares(100)">+100</v-btn>
                    <v-btn size="small" color="error" variant="text" @click="adjustShares(-1000)">-1K</v-btn>
                    <v-btn size="small" color="error" variant="text" @click="adjustShares(-100)">-100</v-btn>
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
                :model-value="computedTotal.toLocaleString()"
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
            <v-col class="d-flex justify-end align-center">
              <div class="d-flex align-baseline mr-6">
                <div class="mr-2 text-grey text-[1.125rem]">淨收付</div>
                <div
                  :class="computedNetAmount === 0 ? 'text-grey' : (form.type === 'buy' ? 'text-error' : 'text-success')"
                  class="text-2xl font-weight-bold"
                >
                  {{ computedNetAmount === 0 ? '$' : (form.type === 'buy' ? '-$' : '+$') }}{{ computedNetAmount.toLocaleString() }}
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

    <v-card class="rounded-lg" style="box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)">
      <v-card-item class="text-base font-semibold pb-2">交易歷史</v-card-item>
      <v-card-text>
        <v-row class="mb-4" align="center">
          <v-col cols="12" sm="6" md="3">
            <v-text-field
              v-model="filters.ticker"
              label="商品代號"
              variant="outlined"
              density="compact"
              hide-details
              @keyup.enter="applyFilters"
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="filters.type"
              :items="[{ title: '全部', value: '' }, { title: '買進', value: 'buy' }, { title: '賣出', value: 'sell' }]"
              label="交易別"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="6" sm="3" md="2">
            <v-menu v-model="startDateMenu" :close-on-content-click="false" :close-on-esc="false">
              <template #activator="{ props }">
                <v-text-field
                  v-model="filters.startDate"
                  label="開始日期"
                  variant="outlined"
                  density="compact"
                  hide-details
                  readonly
                  v-bind="props"
                />
              </template>
              <v-date-picker v-model="filters.startDatePicker" hide-title color="primary">
                <template #actions>
                  <v-btn
                    text
                    color="primary"
                    @click="confirmStartDate"
                  >
                    確認
                  </v-btn>
                </template>
              </v-date-picker>
            </v-menu>
          </v-col>
          <v-col cols="6" sm="3" md="2">
            <v-menu v-model="endDateMenu" :close-on-content-click="false" :close-on-esc="false">
              <template #activator="{ props }">
                <v-text-field
                  v-model="filters.endDate"
                  label="結束日期"
                  variant="outlined"
                  density="compact"
                  hide-details
                  readonly
                  v-bind="props"
                />
              </template>
              <v-date-picker v-model="filters.endDatePicker" hide-title color="primary">
                <template #actions>
                  <v-btn
                    text
                    color="primary"
                    @click="confirmEndDate"
                  >
                    確認
                  </v-btn>
                </template>
              </v-date-picker>
            </v-menu>
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-btn color="primary" @click="applyFilters" class="mr-2">篩選</v-btn>
            <v-btn variant="outlined" @click="clearFilters">清除</v-btn>
          </v-col>
        </v-row>

        <v-table>
          <thead>
            <tr class="bg-grey-lighten-4">
              <th class="text-left font-semibold text-grey-darken-1">成交日期</th>
              <th class="text-left font-semibold text-grey-darken-1">商品</th>
              <th class="text-left font-semibold text-grey-darken-1">交易別</th>
              <th class="text-right font-semibold text-grey-darken-1">股數</th>
              <th class="text-right font-semibold text-grey-darken-1">單價</th>
              <th class="text-right font-semibold text-grey-darken-1">價金</th>
              <th class="text-right font-semibold text-grey-darken-1">手續費</th>
              <th class="text-right font-semibold text-grey-darken-1">交易稅</th>
              <th class="text-right font-semibold text-grey-darken-1">淨收付</th>
              <th class="text-left font-semibold text-grey-darken-1">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in transactions" :key="t.id">
              <td>{{ formatDate(t.date) }}</td>
              <td>
                <div class="font-weight-bold">{{ t.ticker }}</div>
                <div class="text-caption text-grey">{{ t.name }}</div>
              </td>
              <td>
                <v-chip :color="t.type === 'buy' ? 'info' : 'error'" size="small" class="text-xs">
                  {{ t.type === 'buy' ? '買進' : '賣出' }}
                </v-chip>
              </td>
              <td class="text-right">{{ t.shares.toLocaleString() }}</td>
              <td class="text-right">{{ t.price.toLocaleString() }}</td>
              <td class="text-right">{{ t.total.toLocaleString() }}</td>
              <td class="text-right">{{ t.fee.toLocaleString() }}</td>
              <td class="text-right">{{ t.tax.toLocaleString() }}</td>
              <td class="text-right" :class="t.net_amount === 0 ? 'text-grey' : (t.type === 'buy' ? 'text-error' : 'text-success')">
                {{ t.net_amount === 0 ? '-' : (t.type === 'buy' ? '-' : '+') }}{{ Math.abs(t.net_amount).toLocaleString() }}
              </td>
              <td>
                <v-btn color="error" size="small" variant="text" @click="handleDelete(t.id)">
                  刪除
                </v-btn>
              </td>
            </tr>
            <tr v-if="transactions.length === 0">
              <td colspan="10" class="text-center text-grey pa-4">尚無交易記錄</td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>
  </div>
</template>


