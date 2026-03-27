<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useStockList } from '../composables/useStockList';

interface Stock {
  ticker: string;
  name: string;
}

const props = defineProps<{
  ticker?: string;
  name?: string;
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:ticker': [value: string];
  'update:name': [value: string];
  select: [stock: Stock];
}>();

const { loadStockList, addStock, searchStocks, isLoading } = useStockList();

const searchQuery = ref('');
const showDropdown = ref(false);
const results = ref<Stock[]>([]);
const dropdownRef = ref<HTMLElement | null>(null);
const inputRef = ref<any>(null);

const performSearch = () => {
  const query = searchQuery.value;
  if (!query) {
    results.value = [];
    showDropdown.value = false;
    return;
  }

  const searchResults = searchStocks(query);
  results.value = searchResults;
  showDropdown.value = searchResults.length > 0;
};

const selectStock = (stock: Stock) => {
  emit('update:ticker', stock.ticker);
  emit('update:name', stock.name);
  emit('select', stock);
  searchQuery.value = stock.ticker;
  showDropdown.value = false;
  addStock(stock);
};

const handleClickOutside = (e: Event) => {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    showDropdown.value = false;
  }
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    showDropdown.value = false;
  }
};

onMounted(async () => {
  await loadStockList();

  if (props.ticker) {
    searchQuery.value = props.ticker;
  } else if (props.name) {
    searchQuery.value = props.name;
  }

  document.addEventListener('click', handleClickOutside);
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="stock-search" ref="dropdownRef">
    <v-text-field
      ref="inputRef"
      v-model="searchQuery"
      :placeholder="isLoading ? '載入股票清單中...' : placeholder"
      variant="outlined"
      density="compact"
      hide-details
      @input="performSearch"
      @focus="performSearch"
    >
      <template v-if="ticker" #append-inner>
        <v-chip size="small" color="primary">{{ ticker }}</v-chip>
      </template>
    </v-text-field>

    <v-card v-if="showDropdown && results.length > 0" class="dropdown">
      <v-list density="compact">
        <v-list-item
          v-for="stock in results"
          :key="stock.ticker"
          :active="ticker === stock.ticker"
          @click="selectStock(stock)"
        >
          <v-list-item-title>
            <span class="font-weight-bold mr-2">{{ stock.ticker }}</span>
            <span class="text-grey">{{ stock.name }}</span>
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>

    <v-card v-if="showDropdown && results.length === 0 && searchQuery.length >= 1 && !isLoading" class="dropdown">
      <v-list-item class="text-grey">
        找不到 "{{ searchQuery }}"
      </v-list-item>
    </v-card>
  </div>
</template>

<style scoped>
.stock-search {
  position: relative;
}

.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 1000;
  margin-top: 4px;
  max-height: 300px;
  overflow-y: auto;
}
</style>
