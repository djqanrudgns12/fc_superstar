import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Relative base works seamlessly on GitHub Pages subpath (/<repo>/), custom domains, and local preview.
  // Can be overridden via VITE_BASE_PATH (e.g. '/fc_superstar/') in CI if needed.
  base: process.env.VITE_BASE_PATH || './',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'esnext',
    rollupOptions: {
      output: {
        // Split heavy vendor libraries so app updates don't invalidate browser/SW cache for Phaser
        manualChunks: {
          phaser: ['phaser'],
          vendor: ['zustand'],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
