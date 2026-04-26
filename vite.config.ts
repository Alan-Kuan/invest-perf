import path from 'node:path';

import vue from '@vitejs/plugin-vue';
import UnoCSS from 'unocss/vite';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify';

const is_github_pages = process.env.GITHUB_ACTIONS === 'true';
const repo_name = process.env.GITHUB_REPOSITORY?.split('/')[1];
const github_pages_base = repo_name ? `/${repo_name}/` : '/';

export default defineConfig({
  base: is_github_pages ? github_pages_base : '/',
  plugins: [
    vue({
      template: { transformAssetUrls },
    }),
    UnoCSS(),
    Vuetify({
      autoImport: true,
      styles: {
        configFile: 'src/styles/settings.scss',
      },
    }),
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
});
