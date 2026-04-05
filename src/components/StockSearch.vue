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

const { loadStockList, addStock, searchStocks, is_loading } = useStockList();

const search_query = ref('');
const display_value = ref('');
const selected_name = ref('');
const selected_ticker = ref('');
const is_menu_open = ref(false);
const results = ref<Stock[]>([]);
const highlighted_index = ref(-1);
const list_ref = ref<HTMLElement | null>(null);

function performSearch() {
  const query = search_query.value;
  if (!query || query.length < 1) {
    results.value = [];
    highlighted_index.value = -1;
    return;
  }
  results.value = searchStocks(query);
  highlighted_index.value = results.value.length > 0 ? 0 : -1;
}

function selectStock(stock: Stock) {
  emit('update:ticker', stock.ticker);
  emit('update:name', stock.name);
  emit('select', stock);
  selected_name.value = stock.name;
  selected_ticker.value = stock.ticker;
  display_value.value = stock.name;
  search_query.value = '';
  is_menu_open.value = false;
  addStock(stock);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && highlighted_index.value >= 0) {
    e.preventDefault();
    e.stopPropagation();
    selectStock(results.value[highlighted_index.value]);
    return;
  }

  if (!is_menu_open.value) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (highlighted_index.value < results.value.length - 1) {
      highlighted_index.value++;
      scrollToHighlighted();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (highlighted_index.value > 0) {
      highlighted_index.value--;
      scrollToHighlighted();
    }
  } else if (e.key === 'Escape') {
    is_menu_open.value = false;
  }
}

async function scrollToHighlighted() {
  await nextTick();
  const list = list_ref.value as any;
  if (!list?.$el) return;
  const items = list.$el.querySelectorAll('.highlighted');
  if (items.length > 0) {
    items[0].scrollIntoView({ block: 'nearest' });
  }
}

watch(
  () => props.ticker,
  newTicker => {
    search_query.value = newTicker || '';
    display_value.value = '';
    if (!newTicker) {
      selected_ticker.value = '';
      selected_name.value = '';
    }
  },
);

watch(
  () => props.name,
  newName => {
    display_value.value = newName || '';
  },
);

onMounted(async () => {
  await loadStockList();

  if (props.ticker) {
    search_query.value = props.ticker;
  }
  if (props.name) {
    display_value.value = props.name;
  }
});
</script>

<template>
  <v-menu v-model="is_menu_open" :close-on-content-click="false" location="bottom start">
    <template #activator="{ props: activator_props }">
      <v-text-field
        :model-value="display_value || search_query"
        v-bind="activator_props"
        :placeholder="is_loading ? '載入股票清單中...' : placeholder"
        variant="outlined"
        density="compact"
        hide-details
        @update:model-value="
          (val: string) => {
            display_value = '';
            search_query = val;
            performSearch();
          }
        "
        @keydown="handleKeydown"
      >
        <template v-if="selected_ticker" #append-inner>
          <v-chip size="small" color="primary">{{ selected_ticker }}</v-chip>
        </template>
      </v-text-field>
    </template>

    <v-card v-if="results.length > 0" min-width="300" max-height="300" class="overflow-y-auto">
      <v-list ref="list_ref" density="compact">
        <v-list-item
          v-for="(stock, index) in results"
          :key="stock.ticker"
          :class="{ 'bg-grey-lighten-3 highlighted': index === highlighted_index }"
          @click="selectStock(stock)"
          @mouseenter="highlighted_index = index"
        >
          <v-list-item-title>
            <span class="font-weight-bold mr-2">{{ stock.ticker }}</span>
            <span class="text-grey">{{ stock.name }}</span>
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>

    <v-card v-else-if="search_query && search_query.length >= 1 && !is_loading" min-width="300">
      <v-list-item class="text-grey"> 找不到 "{{ search_query }}" </v-list-item>
    </v-card>
  </v-menu>
</template>
