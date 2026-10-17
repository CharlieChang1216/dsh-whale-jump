import fs from 'node:fs';
import path from 'node:path';

const ASAR = 'C:\\Users\\24174\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\app.asar';
const fd = fs.openSync(ASAR, 'r');
const head = Buffer.alloc(16);
fs.readSync(fd, head, 0, 16, 0);
const headerSize = head.readUInt32LE(12);
const headerBuf = Buffer.alloc(headerSize);
fs.readSync(fd, headerBuf, 0, headerSize, 16);
const manifest = JSON.parse(headerBuf.toString('utf8'));
const dataStart = 16 + headerSize;

function findNode(parts) {
  let node = manifest.files;
  for (const p of parts) {
    if (!node || !node[p]) return null;
    node = node[p].files !== undefined && !node[p].offset ? node[p] : node[p];
    if (node.files && p !== parts[parts.length - 1]) node = node.files;
  }
  return node;
}

function getFile(relPath) {
  const parts = relPath.split('/').filter(Boolean);
  let node = manifest.files;
  for (let i = 0; i < parts.length; i++) {
    if (!node || !node[parts[i]]) return null;
    node = node[parts[i]];
    if (i < parts.length - 1) node = node.files;
    if (!node) return null;
  }
  if (node.offset === undefined) return null;
  const buf = Buffer.alloc(node.size);
  fs.readSync(fd, buf, 0, node.size, dataStart + Number(node.offset));
  return buf;
}

function listDir(relPath) {
  const parts = relPath.split('/').filter(Boolean);
  let node = manifest.files;
  for (const p of parts) {
    if (!node || !node[p]) return [];
    node = node[p];
    if (node.files) node = node.files;
  }
  return Object.keys(node || {});
}

const cmd = process.argv[2];
if (cmd === 'ls') {
  console.log(listDir(process.argv[3] || '').join('\n'));
} else if (cmd === 'cat') {
  const b = getFile(process.argv[3]);
  if (!b) { console.error('NOT FOUND'); process.exit(1); }
  process.stdout.write(b.toString('utf8'));
} else if (cmd === 'grep') {
  const needle = process.argv[3];
  const dir = process.argv[4] || '';
  const walk = (rel) => {
    const parts = [...(rel.split('/').filter(Boolean))];
    let node = manifest.files;
    for (const p of parts) { node = node[p]; node = node.files ? node.files : node; }
    for (const name of Object.keys(node)) {
      const full = parts.length ? parts.join('/') + '/' + name : name;
      const child = rel === '' ? manifest.files[name] : (() => { let n = manifest.files; for (const p of parts) n = n[p].files ? n[p].files : n[p]; return n[name]; })();
      if (node[name].files) { walk(full); continue; }
      if (!/\.(js|json|ts|mjs|cjs|d\.ts)$/.test(name)) continue;
      let buf;
      try { buf = getFile(full); } catch { continue; }
      if (!buf) continue;
      const text = buf.toString('utf8');
      if (text.includes(needle)) console.log(full, buf.length);
    }
  };
  walk(dir);
}
fs.closeSync(fd);
