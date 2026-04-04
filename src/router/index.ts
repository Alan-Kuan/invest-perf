import { createRouter, createWebHistory } from 'vue-router';

import Dividends from '../pages/Dividends.vue';
import Performance from '../pages/Performance.vue';
import Portfolio from '../pages/Portfolio.vue';
import Transactions from '../pages/Transactions.vue';

const routes = [
  { path: '/', name: 'transactions', component: Transactions },
  { path: '/portfolio', name: 'portfolio', component: Portfolio },
  { path: '/dividends', name: 'dividends', component: Dividends },
  { path: '/performance', name: 'performance', component: Performance },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
