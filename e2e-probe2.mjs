// 临时探针：安全设置开关切换（用后即删）
import { chromium } from '@playwright/test';

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto('http://localhost:1423/');
await p.getByTestId('pagination-info').waitFor({ timeout: 20000 });

await p.getByRole('button', { name: '只读', exact: true }).click();
const sw = p.locator('#allow-write-ops');
await sw.waitFor();
console.log('switch outerHTML:', (await sw.evaluate((el) => el.outerHTML)).slice(0, 300));
console.log('aria-checked before:', await sw.getAttribute('aria-checked'));
await sw.click({ timeout: 5000 }).catch((e) => console.log('click err:', e.message.split('\n')[0]));
await p.waitForTimeout(1200);
console.log('aria-checked after:', await sw.getAttribute('aria-checked'));
console.log('save_settings calls:', await p.evaluate(() => (window as any).__nervd_mock?.callsOf('save_settings').length));
const last = await p.evaluate(() => (window as any).__nervd_mock?.callsOf('save_settings').at(-1));
console.log('last args:', last ? JSON.stringify(last.args[0]).slice(0, 200) : null);
await b.close();
