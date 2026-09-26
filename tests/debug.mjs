// Ad-hoc debug harness: node tests/debug.mjs "<js to eval in page>" [screenshot-name]
// The JS runs as an async function body with `g` bound to window.__game.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
page.on('console', (m) => console.log('[console.' + m.type() + ']', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack));
fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
// in-page helper: await shot('name') renders a frame then captures it
await page.exposeFunction('__shot', (n) => page.screenshot({ path: path.join(root, 'test-results', n + '.png') }).then(() => true));
await page.addInitScript(() => { window.shot = async (n) => { await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return window.__shot(n); }; });
await page.goto(`http://localhost:${server.address().port}/`);
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 90000 });
const code = process.argv[2] || 'return g.state';
const res = await page.evaluate(`(async () => { const g = window.__game; ${code} })()`);
console.log(JSON.stringify(res, null, 1));
if (process.argv[3]) {
  await page.waitForTimeout(400);
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results', process.argv[3] + '.png') });
}
await browser.close();
server.close();
