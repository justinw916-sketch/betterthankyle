// Packages the playable game into dist/ (and sam-web.zip) for upload to any static web host.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const out = 'dist';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const f of ['index.html', 'style.css', 'GUIDE.html']) fs.copyFileSync(f, `${out}/${f}`);
for (const d of ['src', 'vendor']) fs.cpSync(d, `${out}/${d}`, { recursive: true });
// custom domain for GitHub Pages (override with SAM_DOMAIN, or SAM_DOMAIN= to skip)
const domain = process.env.SAM_DOMAIN ?? 'sam.jwhitton.com';
if (domain) fs.writeFileSync(`${out}/CNAME`, domain + '\n');
fs.writeFileSync(`${out}/.nojekyll`, '');
fs.rmSync('sam-web.zip', { force: true });
try { execSync(`cd ${out} && zip -qr ../sam-web.zip .`); } catch { console.warn('zip not available: skipped sam-web.zip'); }
console.log('Built dist/ and sam-web.zip');
