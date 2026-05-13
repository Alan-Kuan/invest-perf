const BASE_CHART_COLORS = [
  '#f3a6c2',
  '#f7c66b',
  '#9cc7f5',
  '#8dd6b2',
  '#c6b5f6',
  '#f4d06f',
  '#f1a56a',
  '#82dfe8',
  '#e58ed0',
  '#7db7e8',
  '#f28bb3',
  '#b7df7a',
];

const GOLDEN_ANGLE = 137.508;

function generateChartColor(index: number): string {
  const hue = Math.round((index * GOLDEN_ANGLE + 15) % 360);
  const saturation = 58 - (index % 4) * 4;
  const lightness = 72 - (index % 3) * 3;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export function getChartColorPalette(count: number): string[] {
  if (count <= 0) {
    return [];
  }

  const colors = BASE_CHART_COLORS.slice(0, count);

  for (let index = colors.length; index < count; index += 1) {
    colors.push(generateChartColor(index));
  }

  return colors;
}
