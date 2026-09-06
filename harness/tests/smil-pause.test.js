import { test, expect, beforeAll, afterAll } from 'bun:test';
import { startFixtureServer, launchWithExtension } from './helpers.mjs';

const PORT = 8852;
let server, ext;

beforeAll(async () => {
  server = startFixtureServer(PORT);
  ext = await launchWithExtension();
});

afterAll(async () => {
  await ext.close();
  server.stop();
});

test('SMIL <animate> pauses while a YouTube video plays elsewhere', async () => {
  // SMIL animations never set a CSS animation-name, so there is no
  // getComputedStyle().animationPlayState to read - SVGSVGElement.
  // getCurrentTime() (the SMIL timeline clock) is the spec-defined way to
  // tell whether one is actually advancing.
  const stressor = await ext.context.newPage();
  await stressor.goto(`http://127.0.0.1:${PORT}/stressor-tab.html?mode=svg-smil`);
  await stressor.waitForTimeout(500);

  const clock = () => stressor.evaluate(() => document.getElementById('smil-svg').getCurrentTime());

  const before1 = await clock();
  await stressor.waitForTimeout(700);
  const before2 = await clock();
  expect(before2 - before1).toBeGreaterThan(0.3); // baseline: timeline runs at real time

  const video = await ext.context.newPage();
  await video.goto(`http://127.0.0.1:${PORT}/video-tab.html`);
  await video.waitForTimeout(1000); // let play -> background -> broadcast settle

  const during1 = await clock();
  await stressor.waitForTimeout(700);
  const during2 = await clock();
  expect(during2 - during1).toBeLessThan(0.05); // frozen while video plays elsewhere
});
