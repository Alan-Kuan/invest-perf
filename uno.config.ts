import { defineConfig } from 'unocss';
import { presetVuetify } from 'unocss-preset-vuetify';

export default defineConfig({
  presets: [
    presetVuetify()
  ],
  rules: [
    ['text-body-extra-large', { 'font-size': '1.25rem', 'font-weight': '400' }]
  ],
  outputToCssLayers: {
    cssLayerName: (layer) => layer === 'properties' ? null : `uno.${layer}`
  }
});
