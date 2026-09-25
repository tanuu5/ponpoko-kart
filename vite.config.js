import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // open pages reload automatically when the code changes
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
});
