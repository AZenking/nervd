// Playwright E2E 配置（docs/e2e-testing.md §3.4）
// 跑 preview mock 模式：pnpm preview:dev → http://localhost:1423（免 Tauri、免真实云效网络）
import { defineConfig } from '@playwright/test';
import path from 'node:path';

// 浏览器固定安装在工作区内（沙箱 / CI 友好，不写 ~/Library/Caches）；
// 已显式设置 PLAYWRIGHT_BROWSERS_PATH 的环境不受影响。
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve('.playwright-browsers');

export default defineConfig({
  testDir: './e2e',
  timeout: 20_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:1423',
    viewport: { width: 1600, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm preview:dev',
    url: 'http://localhost:1423',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
