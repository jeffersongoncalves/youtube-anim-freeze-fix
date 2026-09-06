import { chromium } from 'playwright';
import { serve } from 'bun';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { syncExtension } from '../sync-extension.mjs';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const harnessDir = path.dirname(fixturesDir);

export function startFixtureServer(port) {
  return serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/favicon.ico') return new Response(null, { status: 404 });
      const file = url.pathname === '/' ? '/video-tab.html' : url.pathname;
      return new Response(Bun.file(path.join(fixturesDir, file)));
    },
  });
}

export async function launchWithExtension({ debug = false } = {}) {
  const extPath = syncExtension({ debug });
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'yt-fix-test-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  });
  return {
    context,
    async close() {
      await context.close();
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

export { harnessDir };
