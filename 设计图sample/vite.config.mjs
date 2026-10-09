import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sampleRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: sampleRoot,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(sampleRoot, '../src'),
    },
  },
  server: {
    port: 1422,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(sampleRoot, 'dist'),
    emptyOutDir: true,
  },
});
