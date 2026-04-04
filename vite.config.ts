import path from 'node:path';

import vue from '@vitejs/plugin-vue';
import UnoCSS from 'unocss/vite';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    vue(),
    UnoCSS(),
    viteStaticCopy({
      targets: [
        {
          src: path.resolve(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm'),
          dest: '',
          rename: { stripBase: true },
        },
      ],
    }),
  ],
  server: {
    proxy: {
      '/api/twse': {
        target: 'https://openapi.twse.com.tw',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/twse/, ''),
      },
      '/api/mis': {
        target: 'https://mis.twse.com.tw',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/mis/, ''),
      },
    },
  },
});
