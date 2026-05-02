export type Market = 'tw' | 'us';

export const DEFAULT_MARKET: Market = 'tw';

export const MARKET_OPTIONS: Array<{ title: string; value: Market }> = [
  { title: '台股', value: 'tw' },
  { title: '美股', value: 'us' },
];

export function normalizeMarket(value: unknown): Market {
  const normalized_value = String(value || '')
    .trim()
    .toLowerCase();
  if (
    normalized_value === 'us' ||
    normalized_value === 'usa' ||
    normalized_value === '美股' ||
    normalized_value === 'us股'
  ) {
    return 'us';
  }

  return 'tw';
}

export function getMarketLabel(market: Market): string {
  return market === 'us' ? '美股' : '台股';
}

export function getMarketStorageKey(base_key: string, market: Market): string {
  return `${base_key}_${market}`;
}
