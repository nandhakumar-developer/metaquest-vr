import { chromium } from 'playwright';

const credentials = {
  deviceUuid: '0176d4eb-d19f-4c92-8af5-c848db2ae078',
  secret: '45628bcc8b592380b9f224edab8e37a99dc66c7147fc2979e4ea690e18cb265e',
};
const base = 'https://192.168.1.134:5000';

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
await context.addInitScript((creds) => {
  localStorage.setItem('vrcc.player.credentials.v1', JSON.stringify(creds));
  localStorage.setItem('vrcc.player.volume.v1', '0');
  localStorage.setItem('vrcc.player.muted.v1', 'true');
  window.__toasts = [];
  document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(() => {
      for (const toast of document.querySelectorAll('.toast')) {
        const text = toast.textContent.trim();
        if (text && !window.__toasts.includes(text)) window.__toasts.push(text);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}, credentials);
const page = await context.newPage();
const logs = [];
page.on('console', (msg) => logs.push(`console.${msg.type()}: ${msg.text()}`));
page.on('pageerror', (error) => logs.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => logs.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));
page.on('response', (response) => {
  if (response.url().includes('/player/vendor/') || response.url().includes('/webxr/')) {
    logs.push(`response ${response.status()}: ${response.url()}`);
  }
});

await page.goto(`${base}/player/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#player-screen:not([hidden])', { timeout: 15000 });
await page.waitForTimeout(1500);

await page.click('#toggle-library');
await page.waitForSelector('.library-item', { timeout: 10000 });
const items = page.locator('.library-item');
const count = await items.count();
for (let i = 0; i < count; i += 1) {
  const title = await items.nth(i).locator('.library-item-title').textContent();
  if (title?.includes('Dinosaurs')) {
    await items.nth(i).click();
    break;
  }
}

for (const wait of [1000, 2000, 4000]) {
  await page.waitForTimeout(wait);
  const state = await page.evaluate(() => ({
    canvasHidden: document.querySelector('#xr-canvas').hidden,
    canvasSize: [document.querySelector('#xr-canvas').width, document.querySelector('#xr-canvas').height],
    videoOpacity: document.querySelector('#video').style.opacity,
    toasts: window.__toasts,
  }));
  console.log(`after ${wait}ms`, state);
}

console.log('\n-- logs --');
console.log(logs.join('\n'));
await browser.close();
