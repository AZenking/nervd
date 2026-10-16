import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const previewRoot = path.dirname(fileURLToPath(import.meta.url));

// 预览构建：把 src 内对 lib/api 的引用重定向到静态 mock，
// 浏览器内直接渲染 Shell（无需 Tauri IPC）
export default defineConfig({
  root: previewRoot,
  base: './',
  publicDir: path.resolve(previewRoot, '../public'),
  plugins: [
    {
      name: 'preview-api-mock',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source.endsWith('lib/api') && importer && importer.includes('/src/')) {
          return path.resolve(previewRoot, 'api-mock.ts');
        }
        return null;
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(previewRoot, '../src'),
    },
  },
  server: { port: 1423, strictPort: true },
  build: { outDir: path.resolve(previewRoot, 'dist'), emptyOutDir: true },
});
