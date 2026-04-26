import { defineConfig, presetWind4, presetWebFonts, transformerDirectives } from 'unocss';

import * as breakpoints from './src/theme/breakpoints';

export default defineConfig({
  presets: [
    presetWind4(),
    presetWebFonts({
      provider: 'bunny',
      fonts: {
        sans: ['Noto Sans:400,500,700', 'Noto Sans TC:400,500,700'],
      },
    }),
  ],
  transformers: [transformerDirectives()],
  shortcuts: {
    'text-rise': 'text-[var(--rise-color)]',
    'text-fall': 'text-[var(--fall-color)]',
  },
  theme: {
    breakpoint: breakpoints.forUnoCSS,
  },
  outputToCssLayers: {
    cssLayerName: layer => (layer === 'properties' ? null : `uno-${layer}`),
  },
});
