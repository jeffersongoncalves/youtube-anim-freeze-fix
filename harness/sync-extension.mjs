// Keeps test-extension/ in sync with the real extension source, plus the
// one manifest difference (youtube-detector.js also matches the local
// fixture server) needed to exercise the real video-detection pipeline
// against a fixture instead of live youtube.com.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extDir = path.join(__dirname, '..');
const testExtDir = path.join(__dirname, 'test-extension');

for (const file of ['background.js', 'youtube-detector.js', 'animation-throttle.js']) {
  copyFileSync(path.join(extDir, file), path.join(testExtDir, file));
}

const manifest = JSON.parse(readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
const ytScript = manifest.content_scripts.find((cs) => cs.js.includes('youtube-detector.js'));
ytScript.matches = [...ytScript.matches, 'http://127.0.0.1:*/video-tab.html*'];
writeFileSync(path.join(testExtDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
