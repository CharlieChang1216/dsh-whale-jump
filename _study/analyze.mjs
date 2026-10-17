import fs from 'node:fs';
import path from 'node:path';

const outDir = path.join(process.env.TEMP, 'dino');
const src = fs.readFileSync(path.join(outDir, '809.js'), 'utf8');

// Light beautify: newline after ; { } , at top-ish level
const pretty = src
  .replace(/;/g, ';\n')
  .replace(/\{/g, '{\n')
  .replace(/\}/g, '\n}\n')
  .replace(/,\s*(?=[A-Za-z_$])/g, ',\n');
fs.writeFileSync(path.join(outDir, '809.pretty.js'), pretty);
console.log('lines:', pretty.split('\n').length);

// Print key constants
const keys = [
  'MAX_JUMP_HEIGHT', 'MIN_JUMP_HEIGHT', 'SPEED_DROP_COEFFICIENT', 'GRAVITY',
  'INITIAL_JUMP_VELOCITY', 'DROP_VELOCITY', 'SPEED', 'ACCELERATION',
  'MAX_SPEED', 'GAP_COEFFICIENT', 'MAX_OBSTACLE_LENGTH', 'BG_CLOUD_SPEED',
  'CLEAR_TIME', 'MAX_CLOUDS', 'CLOUD_FREQUENCY', 'SCORE_COEFFICIENT',
  'FPS', 'BLINK_TIMING', 'config', 'Obstacle', 'Pterodactyl',
];
for (const k of keys) {
  const i = src.indexOf(k);
  if (i >= 0) console.log('\n### ' + k + ' @' + i + '\n' + src.slice(Math.max(0, i - 120), i + 420).replace(/\n/g, ' '));
}
