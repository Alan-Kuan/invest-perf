import { createApp } from 'vue';

import './styles/layers.css'; // layer order definition should be at the top
import 'katex/dist/katex.min.css';
import 'virtual:uno.css';
import App from './App.vue';
import vuetify from './plugins/vuetify';
import router from './router';

const app = createApp(App);

app.use(router);
app.use(vuetify);

app.mount('#app');
