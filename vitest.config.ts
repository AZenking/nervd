// Vitest 单测配置（L1 纯函数 / L2 store 层，docs/e2e-testing.md §2）
// 注意：tsconfig.json 为冻结契约不可改，因此单测统一显式 `import { describe, it } from 'vitest'`，
// 不依赖 globals 类型注入。
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(root, 'src') },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
