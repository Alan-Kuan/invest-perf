<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue';

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
const displayValue = ref('');
const selectedName = ref('');
const selectedTicker = ref('');
const isMenuOpen = ref(false);
const results = ref<Stock[]>([]);
const highlightedIndex = ref(-1);
const listRef = ref<HTMLElement | null>(null);

function performSearch() {
  const query = searchQuery.value;
  if (!query || query.length < 1) {
    results.value = [];
    highlightedIndex.value = -1;
    return;
  }
  results.value = searchStocks(query);
  highlightedIndex.value = results.value.length > 0 ? 0 : -1;
}

function selectStock(stock: Stock) {
  emit('update:ticker', stock.ticker);
  emit('update:name', stock.name);
  emit('select', stock);
  selectedName.value = stock.name;
  selectedTicker.value = stock.ticker;
  displayValue.value = stock.name;
  searchQuery.value = '';
  isMenuOpen.value = false;
  addStock(stock);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && highlightedIndex.value >= 0) {
    e.preventDefault();
    e.stopPropagation();
    selectStock(results.value[highlightedIndex.value]);
    return;
  }

  if (!isMenuOpen.value) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (highlightedIndex.value < results.value.length - 1) {
      highlightedIndex.value++;
      scrollToHighlighted();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (highlightedIndex.value > 0) {
      highlightedIndex.value--;
      scrollToHighlighted();
    }
  } else if (e.key === 'Escape') {
    isMenuOpen.value = false;
  }
}

const scrollToHighlighted = async () => {
  await nextTick();
  const list = listRef.value as any;
  if (!list?.$el) return;
  const items = list.$el.querySelectorAll('.highlighted');
  if (items.length > 0) {
    items[0].scrollIntoView({ block: 'nearest' });
  }
};

watch(
  () => props.ticker,
  newTicker => {
    searchQuery.value = newTicker || '';
    displayValue.value = '';
    if (!newTicker) {
      selectedTicker.value = '';
      selectedName.value = '';
    }
  },
);

watch(
  () => props.name,
  newName => {
    displayValue.value = newName || '';
  },
);

onMounted(async () => {
  await loadStockList();

  if (props.ticker) {
    searchQuery.value = props.ticker;
  }
  if (props.name) {
    displayValue.value = props.name;
  }
});
</script>

<template>
  <v-menu v-model="isMenuOpen" :close-on-content-click="false" location="bottom start">
    <template #activator="{ props: activatorProps }">
      <v-text-field
        :model-value="displayValue || searchQuery"
        v-bind="activatorProps"
        :placeholder="isLoading ? '載入股票清單中...' : placeholder"
        variant="outlined"
        density="compact"
        hide-details
        @update:model-value="
          (val: string) => {
            displayValue = '';
            searchQuery = val;
            performSearch();
          }
        "
        @keydown="handleKeydown"
      >
        <template v-if="selectedTicker" #append-inner>
          <v-chip size="small" color="primary">{{ selectedTicker }}</v-chip>
        </template>
      </v-text-field>
    </template>

    <v-card v-if="results.length > 0" min-width="300" max-height="300" class="overflow-y-auto">
      <v-list ref="listRef" density="compact">
        <v-list-item
          v-for="(stock, index) in results"
          :key="stock.ticker"
          :class="{ 'bg-grey-lighten-3 highlighted': index === highlightedIndex }"
          @click="selectStock(stock)"
          @mouseenter="highlightedIndex = index"
        >
          <v-list-item-title>
            <span class="font-weight-bold mr-2">{{ stock.ticker }}</span>
            <span class="text-grey">{{ stock.name }}</span>
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>

    <v-card v-else-if="searchQuery && searchQuery.length >= 1 && !isLoading" min-width="300">
      <v-list-item class="text-grey"> 找不到 "{{ searchQuery }}" </v-list-item>
    </v-card>
  </v-menu>
</template>
