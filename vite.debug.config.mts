// 临时调试配置（用后即删）：独立 cacheDir + 1424 端口
import { defineConfig, mergeConfig } from 'vite';
import baseConfig from './preview/vite.config.mts';

export default mergeConfig(
  baseConfig,
  defineConfig({
    cacheDir: './node_modules/.vite-debug',
    server: { port: 1424, strictPort: false },
  }),
);
