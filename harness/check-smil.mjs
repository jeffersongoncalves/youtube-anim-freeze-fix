// Functional check (not timing): does the extension actually stop the
// SMIL <animate> from progressing while a YouTube video plays elsewhere?
import './sync-extension.mjs';
import { chromium } from 'playwright';
import { serve } from 'bun';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8843;

const server = serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/favicon.ico') return new Response(null, { status: 404 });
    const file = url.pathname === '/' ? '/video-tab.html' : url.pathname;
    return new Response(Bun.file(path.join(__dirname, 'fixtures', file)));
  },
});

async function main() {
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'yt-fix-smil-'));
  const extPath = path.join(__dirname, 'test-extension');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  });

  try {
    const stressorPage = await context.newPage();
    await stressorPage.goto(`http://127.0.0.1:${PORT}/stressor-tab.html?mode=svg-smil`);
    await stressorPage.waitForTimeout(500);

    // SVGSVGElement.getCurrentTime() is the SMIL timeline clock, in
    // seconds - the spec-defined way to tell if a SMIL animation is
    // actually advancing, independent of exact interpolated values.
    const readClock = () => stressorPage.evaluate(() => document.getElementById('smil-svg').getCurrentTime());

    const before1 = await readClock();
    await stressorPage.waitForTimeout(700);
    const before2 = await readClock();
    const beforeDelta = before2 - before1;
    console.log('no video playing  -> timeline delta:', beforeDelta.toFixed(2) + 's', '(expect ~0.7s if running)');

    // Start "video" in another tab.
    const videoPage = await context.newPage();
    await videoPage.goto(`http://127.0.0.1:${PORT}/video-tab.html`);
    await videoPage.waitForTimeout(1000); // let the play->background->broadcast pipeline settle

    const flagSet = await stressorPage.evaluate(() => document.documentElement.classList.contains('yt-fix-video-elsewhere'));
    console.log('FLAG class present on stressor tab:', flagSet);

    const during1 = await readClock();
    await stressorPage.waitForTimeout(700);
    const during2 = await readClock();
    const duringDelta = during2 - during1;
    console.log('video playing      -> timeline delta:', duringDelta.toFixed(2) + 's', '(expect ~0s if paused)');

    const baselineRuns = beforeDelta > 0.3;
    const pausedWhilePlaying = duringDelta < 0.05;
    console.log('\nRESULT:', baselineRuns && pausedWhilePlaying
      ? 'PASS - SMIL animation runs normally, then pauses while video plays elsewhere'
      : !baselineRuns
        ? 'INCONCLUSIVE - baseline animation was not even running (harness issue)'
        : 'FAIL - still animating while video plays elsewhere');
  } finally {
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
    server.stop();
  }
}

main().catch((e) => {
  console.error(e);
  server.stop();
  process.exit(1);
});
