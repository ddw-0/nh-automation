import { chromium } from 'playwright';

const BASE = (process.env.NH_BASE_URL || 'https://normalhoy.app').replace(/\/+$/, '');
const TOKEN = process.env.NH_SHARECARD_TOKEN;

if (!TOKEN) {
  console.error('Missing env: NH_SHARECARD_TOKEN');
  process.exit(1);
}

const daily = await fetch(`${BASE}/api/daily-question.json`, { headers: { 'User-Agent': 'nh-automation/1.0' } }).then((r) => r.json());
if (!daily.ok || !daily.id || !daily.theme) {
  console.error('Bad daily payload:', daily);
  process.exit(1);
}

const url = `${BASE}/sharecard/render?id=${encodeURIComponent(String(daily.id))}&theme=${encodeURIComponent(daily.theme)}&autoupload=1&token=${encodeURIComponent(TOKEN)}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 1000 } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.body?.innerText?.includes('OK'), null, { timeout: 120000 });
await browser.close();

console.log('OK');

