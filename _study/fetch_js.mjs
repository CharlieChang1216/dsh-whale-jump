import fs from 'node:fs';
import path from 'node:path';

const outDir = path.join(process.env.TEMP, 'dino');
fs.mkdirSync(outDir, { recursive: true });
const base = 'https://dinosaur.game';
const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
const re = /src="(\/assets\/js\/[^"]+)"/g;
const names = [];
let m;
while ((m = re.exec(html))) names.push(m[1]);
for (const u of names) {
  const abs = base + u;
  const r = await fetch(abs);
  const buf = Buffer.from(await r.arrayBuffer());
  const name = u.split('/').pop().split('?')[0];
  fs.writeFileSync(path.join(outDir, name), buf);
  console.log('OK', name, r.status, buf.length);
}
