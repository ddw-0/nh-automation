import { chromium } from 'playwright';

const BASE = (process.env.NH_BASE_URL || 'https://normalhoy.app').replace(/\/+$/, '');
const TOKEN = process.env.NH_SHARECARD_TOKEN;

if (!TOKEN) {
  console.error('Missing env: NH_SHARECARD_TOKEN');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDailyQuestionJson(page) {
  const dailyUrl = `${BASE}/api/daily-question.json`;

  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await page.evaluate(async (url) => {
      const r = await fetch(url, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        credentials: 'omit'
      });
      return {
        ok: r.ok,
        status: r.status,
        contentType: r.headers.get('content-type') || '',
        text: await r.text()
      };
    }, dailyUrl);

    const contentType = String(res.contentType || '').toLowerCase();
    if (res.ok && contentType.includes('application/json')) {
      try {
        return JSON.parse(res.text);
      } catch {
        // fallthrough to retry with diagnostics
      }
    }

    const snippet = String(res.text || '')
      .slice(0, 220)
      .replace(/\s+/g, ' ')
      .trim();

    console.error(
      `[daily] attempt ${attempt}/4: status=${res.status} content-type=${JSON.stringify(res.contentType)} body=${JSON.stringify(snippet)}`
    );

    if (attempt < 4) await sleep(4000 * attempt);
  }

  throw new Error('Failed to fetch /api/daily-question.json as JSON (got HTML or invalid JSON)');
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 800, height: 1000 } });
const page = await context.newPage();

// Warm up the session in case the origin applies bot-protection challenges to non-browser clients.
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);

const daily = await fetchDailyQuestionJson(page);
if (!daily || !daily.ok || !daily.id || !daily.theme) {
  console.error('Bad daily payload:', daily);
  process.exit(1);
}

const url = `${BASE}/sharecard/render?id=${encodeURIComponent(String(daily.id))}&theme=${encodeURIComponent(
  daily.theme
)}&autoupload=1&token=${encodeURIComponent(TOKEN)}`;

await page.goto(url, { waitUntil: 'networkidle', timeout: 180000 });
await page.waitForFunction(
  () => {
    const text = document.body?.innerText || '';
    return text.includes('OK') || text.includes('ERROR:');
  },
  null,
  { timeout: 180000 }
);

const finalText = await page.evaluate(() => document.body?.innerText || '');
if (!finalText.includes('OK')) {
  const snippet = finalText.slice(0, 300).replace(/\s+/g, ' ').trim();
  throw new Error(`Sharecard render did not finish OK: ${snippet}`);
}

await browser.close();

console.log('OK');
