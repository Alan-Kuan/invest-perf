<script setup lang="ts">
import { ref } from 'vue';
import { onMounted, provide } from 'vue';

import { useDatabase } from './composables/useDatabase';

const { init, exportData, importData, clear } = useDatabase();

const file_input = ref<HTMLInputElement | null>(null);
const is_importing = ref(false);

const snackbar = ref(false);
const snackbar_text = ref('');
const snackbar_color = ref('success');

const confirm_dialog = ref(false);
const confirm_message = ref('');
const confirm_resolve = ref<((value: boolean) => void) | null>(null);

function showSnackbar(text: string, color: string = 'success') {
  snackbar_text.value = text;
  snackbar_color.value = color;
  snackbar.value = true;
}

function showConfirm(message: string): Promise<boolean> {
  confirm_message.value = message;
  confirm_dialog.value = true;
  return new Promise(resolve => {
    confirm_resolve.value = resolve;
  });
}

function handleConfirm(result: boolean) {
  confirm_dialog.value = false;
  confirm_resolve.value?.(result);
  confirm_resolve.value = null;
}

function handleExport() {
  exportData();
}

function handleImportClick() {
  file_input.value?.click();
}

provide('showSnackbar', showSnackbar);
provide('showConfirm', showConfirm);

onMounted(async () => {
  await init();
});

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  if (!(await showConfirm('匯入會取代現有資料，確定要繼續嗎？'))) {
    target.value = '';
    return;
  }

  is_importing.value = true;
  try {
    await importData(file);
    window.location.reload();
  } catch (e) {
    showSnackbar('匯入失敗: ' + (e as Error).message, 'error');
    is_importing.value = false;
  }
  target.value = '';
}

async function handleClear() {
  if (!(await showConfirm('確定要清除所有資料嗎？此操作無法復原！'))) {
    return;
  }

  if (!(await showConfirm('再次確認：所有交易、股利、持股資料都會被刪除！'))) {
    return;
  }

  await clear();
  window.location.reload();
}

async function handleClearCache() {
  if (!(await showConfirm('確定要清除績效快取、股票現價快取與股票名稱快取嗎？'))) {
    return;
  }
  localStorage.removeItem('annual_performance_cache');
  localStorage.removeItem('curr_prices_cache');
  localStorage.removeItem('price_last_update');
  localStorage.removeItem('stock_list_cache');
  showSnackbar('快取已清除');
}
</script>

<template>
  <v-app>
    <v-navigation-drawer app color="secondary">
      <div class="pa-4">
        <div class="text-xl text-accent font-bold mb-4">投資績效</div>

        <v-divider class="mb-4" />

        <v-list nav bg-color="secondary">
          <v-list-item
            to="/"
            prepend-icon="mdi-swap-horizontal"
            title="交易"
            value="transactions"
            class="mb-1 rounded-lg px-2"
          />
          <v-list-item
            to="/dividends"
            prepend-icon="mdi-cash"
            title="股利"
            value="dividends"
            class="mb-1 rounded-lg px-2"
          />
          <v-list-item
            to="/portfolio"
            prepend-icon="mdi-chart-pie"
            title="組合"
            value="portfolio"
            class="mb-1 rounded-lg px-2"
          />
          <v-list-item
            to="/performance"
            prepend-icon="mdi-chart-line"
            title="績效"
            value="performance"
            class="mb-1 rounded-lg px-2"
          />
        </v-list>
      </div>

      <template #append>
        <div class="pa-4">
          <v-divider class="mb-4" />
          <div class="text-sm text-neutral-300 mb-2">資料管理</div>
          <v-list nav density="compact" bg-color="secondary">
            <v-list-item
              @click="handleExport"
              prepend-icon="mdi-download"
              title="匯出資料庫"
              density="compact"
              class="mb-1 rounded-lg px-2"
            />
            <v-list-item
              @click="handleImportClick"
              prepend-icon="mdi-upload"
              :disabled="is_importing"
              density="compact"
              class="mb-1 rounded-lg px-2"
            >
              <template #title>
                {{ is_importing ? '匯入中...' : '匯入資料庫' }}
              </template>
            </v-list-item>
            <v-list-item
              @click="handleClear"
              prepend-icon="mdi-delete"
              title="清除資料庫"
              class="text-error rounded-lg px-2"
              density="compact"
            />
            <v-list-item
              @click="handleClearCache"
              prepend-icon="mdi-trash-can-outline"
              title="清除快取"
              class="rounded-lg px-2"
              density="compact"
            />
            <input
              ref="file_input"
              type="file"
              accept=".db"
              class="hidden"
              @change="handleFileChange"
            />
          </v-list>
        </div>
      </template>
    </v-navigation-drawer>

    <v-main>
      <v-container class="pa-6 max-w-90%">
        <router-view />
      </v-container>
    </v-main>

    <v-snackbar v-model="snackbar" location="bottom right" :color="snackbar_color" :timeout="3000">
      {{ snackbar_text }}
    </v-snackbar>

    <v-dialog v-model="confirm_dialog" max-width="400">
      <v-card>
        <v-card-title>確認</v-card-title>
        <v-card-text>{{ confirm_message }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="handleConfirm(false)">取消</v-btn>
          <v-btn color="primary" variant="flat" @click="handleConfirm(true)">確定</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>
