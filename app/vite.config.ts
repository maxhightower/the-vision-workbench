import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React frontend runs on :5173 in dev and proxies /api to the existing
// Node server on :4810 (SSE included). Production build lands in app/dist.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4810', changeOrigin: true },
    },
  },
});
