import { defineConfig } from 'unocss';
import { presetMini } from '@unocss/preset-mini';
import { presetVuetify } from 'unocss-preset-vuetify';

export default defineConfig({
  presets: [
    presetMini(),
    presetVuetify()
  ],
  outputToCssLayers: {
    cssLayerName: (layer) => layer === 'properties' ? null : `uno.${layer}`
  }
});
