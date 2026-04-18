import { createVuetify } from 'vuetify';

import { forVuetify } from '../theme/breakpoints';

import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';

const custom_theme = {
  dark: false,
  colors: {
    primary: '#2196f3',
    secondary: '#1a1a2e',
    accent: '#40c4ff',
    success: '#4caf50',
    error: '#f44336',
  },
};

export default createVuetify({
  theme: {
    defaultTheme: 'custom_theme',
    themes: {
      custom_theme,
    },
  },
  display: {
    mobileBreakpoint: 'md',
    thresholds: forVuetify,
  },
});
