<script setup lang="ts">
import { ref } from 'vue';
import { onMounted } from 'vue';
import { useDatabase } from './composables/useDatabase';

const { init, exportData, importData, clear } = useDatabase();

const fileInput = ref<HTMLInputElement | null>(null);
const isImporting = ref(false);

onMounted(async () => {
  await init();
});

const handleExport = () => {
  exportData();
};

const handleImportClick = () => {
  fileInput.value?.click();
};

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  if (!confirm('匯入會取代現有資料，確定要繼續嗎？')) {
    target.value = '';
    return;
  }

  isImporting.value = true;
  try {
    await importData(file);
    window.location.reload();
  } catch (e) {
    alert('匯入失敗: ' + (e as Error).message);
    isImporting.value = false;
  }
  target.value = '';
};

const handleClear = async () => {
  if (!confirm('確定要清除所有資料嗎？此操作無法復原！')) {
    return;
  }

  if (!confirm('再次確認：所有交易、股利、持股資料都會被刪除！')) {
    return;
  }

  await clear();
  window.location.reload();
};
</script>

<template>
  <v-app>
    <v-navigation-drawer app color="#1a1a2e">
      <div class="pa-4">
        <div class="text-h5 text-primary font-weight-bold mb-4">投資績效</div>

        <v-divider class="mb-4" />

        <v-list nav>
          <v-list-item to="/" prepend-icon="mdi-swap-horizontal" title="交易" value="transactions" class="mb-1 rounded-lg px-2" />
          <v-list-item to="/portfolio" prepend-icon="mdi-chart-pie" title="組合" value="portfolio" class="mb-1 rounded-lg px-2" />
          <v-list-item to="/dividends" prepend-icon="mdi-cash" title="股利" value="dividends" class="mb-1 rounded-lg px-2" />
          <v-list-item to="/performance" prepend-icon="mdi-chart-line" title="績效" value="performance" class="mb-1 rounded-lg px-2" />
        </v-list>
      </div>

      <template #append>
        <div class="pa-4">
          <v-divider class="mb-4" />
          <div class="text-caption text-grey mb-2">資料管理</div>
          <v-list nav density="compact">
            <v-list-item @click="handleExport" prepend-icon="mdi-download" title="匯出備份" density="compact" class="mb-1 rounded-lg px-2" />
            <v-list-item @click="handleImportClick" prepend-icon="mdi-upload" :disabled="isImporting" density="compact" class="mb-1 rounded-lg px-2">
              <template #title>
                {{ isImporting ? '匯入中...' : '匯入資料' }}
              </template>
            </v-list-item>
            <v-list-item @click="handleClear" prepend-icon="mdi-delete" title="清除所有資料" class="text-error rounded-lg px-2" density="compact" />
            <input
              ref="fileInput"
              type="file"
              accept=".db"
              style="display: none"
              @change="handleFileChange"
            />
          </v-list>
        </div>
      </template>
    </v-navigation-drawer>

    <v-main>
      <v-container class="pa-6">
        <router-view />
      </v-container>
    </v-main>
  </v-app>
</template>
