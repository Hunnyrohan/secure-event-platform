import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies /api to the backend so cookies are same-origin,
// avoiding cross-site cookie friction during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
