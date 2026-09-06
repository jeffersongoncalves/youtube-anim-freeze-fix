// Diagnostic harness: measures main-thread/compositor jank in a "video"
// tab while a "stressor" tab (different CSS/DOM-churn patterns) runs,
// with and without the extension loaded, so we get a real pass/fail
// number instead of "reload and see if it feels laggy".
import './sync-extension.mjs';
import { chromium } from 'playwright';
import { serve } from 'bun';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8842;
const MODES = ['none', 'css-paint', 'css-transform', 'waapi', 'dom-big', 'dom-small', 'combo'];
const SETTLE_MS = 1200;
const MEASURE_MS = 4000;

const server = serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/favicon.ico') return new Response(null, { status: 404 });
    const file = url.pathname === '/' ? '/video-tab.html' : url.pathname;
    return new Response(Bun.file(path.join(__dirname, 'fixtures', file)));
  },
});

async function runOne({ withExtension, mode }) {
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'yt-fix-pw-'));
  const extPath = path.join(__dirname, 'test-extension');
  const args = withExtension
    ? [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`]
    : [];

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args,
  });

  try {
    const videoPage = await context.newPage();
    await videoPage.goto(`http://127.0.0.1:${PORT}/video-tab.html`);

    const stressorPage = await context.newPage();
    await stressorPage.goto(`http://127.0.0.1:${PORT}/stressor-tab.html?mode=${mode}`);

    await videoPage.waitForTimeout(SETTLE_MS);
    await videoPage.evaluate(() => window.__startProbe());
    await videoPage.waitForTimeout(MEASURE_MS);
    const stats = await videoPage.evaluate(() => window.__stopProbe());

    return stats;
  } finally {
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function main() {
  const results = [];
  for (const withExtension of [false, true]) {
    for (const mode of MODES) {
      process.stderr.write(`running: extension=${withExtension} mode=${mode}\n`);
      const stats = await runOne({ withExtension, mode });
      results.push({ withExtension, mode, ...stats });
    }
  }

  const row = (a, b, c, d, e, f) => [a.padEnd(12), b.padEnd(14), c.padStart(8), d.padStart(10), e.padStart(8), f.padStart(8)].join(' ');
  console.log('\n' + row('extension', 'mode', 'frames', 'maxGap', '>50ms', '>200ms'));
  for (const r of results) {
    console.log(
      row(
        r.withExtension ? 'on' : 'off',
        r.mode,
        String(r.frames),
        r.maxGapMs.toFixed(1) + 'ms',
        String(r.longFrames),
        String(r.veryLongFrames)
      )
    );
  }

  server.stop();
}

main().catch((e) => {
  console.error(e);
  server.stop();
  process.exit(1);
});
