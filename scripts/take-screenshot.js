import puppeteer from 'puppeteer-core';

async function main() {
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222',
    defaultViewport: null,
  });

  const pages = await browser.pages();
  let page = pages.find((p) => p.url().includes('1423'));
  if (!page) {
    page = await browser.newPage();
    await page.goto('http://localhost:1423/#workbench');
  }

  await page.bringToFront();
  await page.waitForSelector('body');
  await new Promise((r) => setTimeout(r, 1500));

  await page.screenshot({
    path: '/Users/charles/.gemini/antigravity/brain/467bc1b2-7492-4556-a73c-dba0610bba88/current-iteration-actual.png',
  });

  console.log('Screenshot taken!');
  browser.disconnect();
}

main().catch(console.error);
