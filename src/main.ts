import { createApp } from 'vue';

import '@mdi/font/css/materialdesignicons.css';
import 'virtual:uno.css';
import 'katex/dist/katex.min.css';
import App from './App.vue';
import { vuetify } from './plugins/vuetify';
import router from './router';

const app = createApp(App);

app.use(router);
app.use(vuetify);

app.mount('#app');
