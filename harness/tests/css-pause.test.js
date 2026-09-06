import { test, expect, beforeAll, afterAll } from 'bun:test';
import { startFixtureServer, launchWithExtension } from './helpers.mjs';

const PORT = 8851;
let server, ext;

beforeAll(async () => {
  server = startFixtureServer(PORT);
  ext = await launchWithExtension();
});

afterAll(async () => {
  await ext.close();
  server.stop();
});

test('CSS keyframe animation pauses while a YouTube video plays elsewhere, and resumes after', async () => {
  const stressor = await ext.context.newPage();
  await stressor.goto(`http://127.0.0.1:${PORT}/stressor-tab.html?mode=css-transform`);
  await stressor.waitForTimeout(500);

  const playState = () =>
    stressor.evaluate(() => getComputedStyle(document.querySelector('.spin-x')).animationPlayState);

  expect(await playState()).toBe('running');

  const video = await ext.context.newPage();
  await video.goto(`http://127.0.0.1:${PORT}/video-tab.html`);
  await video.waitForTimeout(1000); // let play -> background -> broadcast settle

  expect(await playState()).toBe('paused');

  await video.close();
  await stressor.waitForTimeout(1000); // let close -> tabs.onRemoved -> broadcast settle

  expect(await playState()).toBe('running');
});
