import { chromium } from 'playwright';
import { createHash } from 'node:crypto';

const credentials = {
  deviceUuid: '0176d4eb-d19f-4c92-8af5-c848db2ae078',
  secret: '45628bcc8b592380b9f224edab8e37a99dc66c7147fc2979e4ea690e18cb265e',
};
const base = process.argv[2] || 'https://192.168.1.134:5000';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
await context.addInitScript((creds) => {
  localStorage.setItem('vrcc.player.credentials.v1', JSON.stringify(creds));
  localStorage.setItem('vrcc.player.volume.v1', '0');
  localStorage.setItem('vrcc.player.muted.v1', 'true');
}, credentials);
const page = await context.newPage();
const logs = [];
page.on('console', (msg) => logs.push(`console.${msg.type()}: ${msg.text()}`));
page.on('pageerror', (error) => logs.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => {
  const url = request.url();
  if (!url.includes('/api/player/stream/')) logs.push(`requestfailed: ${url} ${request.failure()?.errorText}`);
});

await page.goto(`${base}/player/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#player-screen:not([hidden])', { timeout: 15000 });
await page.waitForTimeout(2000);

async function state() {
  return page.evaluate(() => {
    const video = document.querySelector('#video');
    const canvas = document.querySelector('#xr-canvas');
    return {
      currentSrc: video.currentSrc,
      readyState: video.readyState,
      error: video.error ? { code: video.error.code, message: video.error.message } : null,
      duration: video.duration,
      currentTime: video.currentTime,
      paused: video.paused,
      canvasHidden: canvas.hidden,
      canvasSize: [canvas.width, canvas.height],
      videoOpacity: video.style.opacity,
      status: document.querySelector('#status-line')?.textContent,
      toasts: [...document.querySelectorAll('.toast')].map((toast) => toast.textContent.trim()),
      secure: window.isSecureContext,
      xr: typeof navigator.xr,
      library: [...document.querySelectorAll('.library-item-title')].map((item) => item.textContent),
    };
  });
}

async function ensureLibraryOpen() {
  const hidden = await page.evaluate(() => document.querySelector('#library-panel')?.hidden);
  if (hidden) await page.click('#toggle-library');
  await page.waitForSelector('.library-item', { state: 'visible', timeout: 10000 });
}

async function pick(name) {
  await ensureLibraryOpen();
  const items = page.locator('.library-item');
  const count = await items.count();
  for (let i = 0; i < count; i += 1) {
    const title = await items.nth(i).locator('.library-item-title').textContent();
    if (title?.includes(name)) {
      await items.nth(i).click();
      return title;
    }
  }
  throw new Error(`Not found: ${name}`);
}

async function canvasHash() {
  return page.evaluate(() => {
    const canvas = document.querySelector('#xr-canvas');
    return canvas.toDataURL('image/png');
  });
}

async function canvasStats() {
  return page.evaluate(() => {
    const canvas = document.querySelector('#xr-canvas');
    const probe = document.createElement('canvas');
    probe.width = 64;
    probe.height = 64;
    const context = probe.getContext('2d');
    context.drawImage(canvas, 0, 0, 64, 64);
    const data = context.getImageData(0, 0, 64, 64).data;
    let nonBlack = 0;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const value = data[i] + data[i + 1] + data[i + 2];
      sum += value;
      if (value > 30) nonBlack += 1;
    }
    return { nonBlack, average: Math.round(sum / (64 * 64 * 3)) };
  });
}

const hash = (value) => createHash('sha256').update(value).digest('hex').slice(0, 16);

console.log('initial', await state());
const xrSupport = await page.evaluate(() => navigator.xr?.isSessionSupported?.('immersive-vr'));
console.log('isSessionSupported(immersive-vr):', xrSupport);

console.log('\n-- load 360 video --');
console.log('picked', await pick('Dinosaurs'));
await page.waitForSelector('#xr-canvas:not([hidden])', { timeout: 20000 });
await page.waitForTimeout(1000);
console.log('after 360 load', await state());

console.log('\n-- play and seek --');
await page.click('#btn-play');
await page.waitForTimeout(1500);
await page.evaluate(() => {
  document.querySelector('#video').currentTime = 30;
});
await page.waitForTimeout(2500);
console.log('playing 360', await state());
const stats = await canvasStats();
console.log('canvas stats', stats);

const before = await canvasHash();
console.log('canvas hash before drag', hash(before));
await page.mouse.move(640, 400);
await page.mouse.down();
await page.mouse.move(900, 400, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(500);
const after = await canvasHash();
console.log('canvas hash after drag ', hash(after));
console.log('drag changed render:', before !== after);

console.log('\n-- enter VR over HTTPS --');
await page.click('#btn-enter-vr');
await page.waitForTimeout(2500);
console.log('after VR click', await state());

console.log('\n-- switch back to flat video --');
console.log('picked', await pick('NDUR'));
await page.waitForTimeout(2500);
console.log('after flat load', await state());
await page.click('#btn-play');
await page.waitForTimeout(2000);
console.log('flat playing', await state());

console.log('\n-- logs --');
console.log(logs.join('\n'));
await browser.close();
