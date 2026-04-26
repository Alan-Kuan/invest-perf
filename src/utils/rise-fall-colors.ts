export type RiseFallColorScheme = 'red-rise' | 'green-rise';

const STORAGE_KEY = 'rise_fall_color_scheme';

export function loadRiseFallColorScheme(): RiseFallColorScheme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'green-rise' ? 'green-rise' : 'red-rise';
}

export function saveRiseFallColorScheme(scheme: RiseFallColorScheme): void {
  localStorage.setItem(STORAGE_KEY, scheme);
}

export function applyRiseFallColorScheme(scheme: RiseFallColorScheme): void {
  document.documentElement.dataset.riseFallScheme = scheme;
}

export function getRiseFallColorSchemeLabel(scheme: RiseFallColorScheme): string {
  return scheme === 'red-rise' ? '紅漲綠跌' : '綠漲紅跌';
}
