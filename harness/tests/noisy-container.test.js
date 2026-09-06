import { test, expect, beforeAll, afterAll } from 'bun:test';
import { startFixtureServer, launchWithExtension } from './helpers.mjs';

const PORT = 8853;
let server, ext;

beforeAll(async () => {
  server = startFixtureServer(PORT);
  ext = await launchWithExtension({ debug: true }); // need [yt-fix] console logs for this one
});

afterAll(async () => {
  await ext.close();
  server.stop();
});

test('a container that redraws an oversized batch gets blacklisted from further scans', async () => {
  const stressor = await ext.context.newPage();

  let blacklisted = false;
  stressor.on('console', (msg) => {
    if (msg.text().includes('blacklisting noisy container')) blacklisted = true;
  });

  await stressor.goto(`http://127.0.0.1:${PORT}/stressor-tab.html?mode=dom-big`);

  const deadline = Date.now() + 3000;
  while (!blacklisted && Date.now() < deadline) {
    await stressor.waitForTimeout(100);
  }

  expect(blacklisted).toBe(true);
});
