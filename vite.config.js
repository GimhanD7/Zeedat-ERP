import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic' },
  server: {
    host: '127.0.0.1',
    proxy: { '/api': { target: process.env.PHP_ORIGIN || 'http://127.0.0.1:8081' } },
  },
});
