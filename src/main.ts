import { createApp } from 'vue';
import '@mdi/font/css/materialdesignicons.css';
import 'virtual:uno.css';
import App from './App.vue';
import router from './router';
import { vuetify } from './plugins/vuetify';

const app = createApp(App);

app.use(router);
app.use(vuetify);

app.mount('#app');
