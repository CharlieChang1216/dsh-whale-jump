#!/usr/bin/env node
'use strict'
/** 清单自检：package.json 必需字段 + 发布文件存在性。CI 与本地共用。 */
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

const checks = [
  ['main 入口', () => pkg.main],
  ['icon 图标', () => pkg.icon],
  ['dsh.bundle.patch', () => pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch],
  ['dsh.client.platform', () => pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform],
  ["exports['./client']", () => pkg.exports && pkg.exports['./client']],
]

let failed = 0
for (const [name, fn] of checks) {
  if (!fn()) { console.error('  FAIL  package.json 缺少 ' + name); failed++ }
  else { console.log('  PASS  ' + name) }
}

const files = ['lib/index.js', 'lib/client.js', 'cordis.patch.yml', pkg.icon]
for (const f of files) {
  if (!fs.existsSync(path.join(root, f))) { console.error('  FAIL  缺少文件 ' + f); failed++ }
  else { console.log('  PASS  文件存在 ' + f) }
}

if (failed) { console.error('==== ' + failed + ' failed ===='); process.exit(1) }
console.log('manifest ok:', pkg.name, pkg.version)
