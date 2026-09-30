import { defineConfig } from 'vite';
export default defineConfig({
  base: '/porsche-911sc-engine/',
  build: { target: 'es2019', chunkSizeWarningLimit: 900 },
});
