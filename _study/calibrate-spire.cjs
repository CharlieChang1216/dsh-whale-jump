/**
 * 校准「跳不过去」的灯塔高度。
 *
 * 判据：角色在跳跃最高点时，碰撞盒**底沿**仍低于灯塔顶部 → 无论怎么按都撞。
 * 碰撞盒底沿 = WATER_Y + 10 - py，灯塔顶部 = WATER_Y - h。
 * 所以需要 py < 10 + h 恒成立；h 越大越不可跳过。
 */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const SRC = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')

const noop = () => {}
const ctx2d = new Proxy({ createLinearGradient: () => ({ addColorStop: noop }) }, { get: (t, p) => (p in t ? t[p] : noop) })
let factory = null
const sandbox = {
  window: { __ModuleLoader__: { load: (hd) => (factory = hd.factory) }, devicePixelRatio: 1, addEventListener: noop, removeEventListener: noop },
  document: {
    documentElement: { lang: 'zh-CN', appendChild: noop },
    head: { appendChild: noop },
    body: { appendChild: noop },
    createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d, addEventListener: noop, focus: noop }),
    querySelector: () => null,
    addEventListener: noop,
  },
  navigator: { language: 'zh-CN' },
  Image: class { constructor() { this.complete = false; this.naturalWidth = 0 } },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: noop,
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ best: 0 }) }),
  console, Math, Date, JSON,
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(SRC, sandbox, { filename: 'client.js' })

const mod = factory((s) => (s === 'react' ? { useCallback: (f) => f, useState: (i) => [i, noop], useEffect: noop } : { jsx: (t, p) => ({ t, p }) }))
const { WhaleJump, CFG, OBSTACLES } = mod.__engine

const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx2d, addEventListener: noop, focus: noop }

function mk() {
  const g = new WhaleJump(canvas, { heroUrl: '', best: 0 })
  g.running = true
  g.over = false
  g.spawn = () => {}
  g.obstacles = []
  return g
}

/** 长按跳一次，返回最高点 py。 */
function maxJumpPy(speed) {
  const g = mk()
  g.speed = speed
  g.press()
  let peak = 0
  for (let i = 0; i < 200; i++) {
    g.update(CFG.MSPF)
    peak = Math.max(peak, g.py)
    if (!g.jumping) break
  }
  return peak
}

const waterY = CFG.WATER_Y
console.log('水线 =', waterY, ' 角色碰撞盒底沿 = 水线+10-py')

for (const spd of [6, 8, 12.5]) {
  const peak = maxJumpPy(spd)
  const bottomAtPeak = waterY + 10 - peak
  console.log(`\nspeed=${spd}: 跳跃峰值 py=${peak.toFixed(1)}, 峰值时碰撞盒底沿 y=${bottomAtPeak.toFixed(1)}`)
  for (const o of OBSTACLES.filter((x) => x.layer === 'surface')) {
    const topY = waterY - o.h
    const canClear = bottomAtPeak < topY
    const label = o.kind === 'spire' ? 'SPIRE' : o.kind
    console.log(`   ${label.padEnd(6)} h=${String(o.h).padStart(2)} 顶部 y=${topY.toFixed(0)}  可跳过=${canClear ? 'YES' : 'NO '}`)
  }
}

// 结论
const spire = OBSTACLES.find((o) => o.kind === 'spire')
const highestJump = Math.max(...[6, 8, 10, 12.5].map(maxJumpPy))
const spireTop = waterY - spire.h
const clearanceNeeded = waterY + 10 - highestJump
console.log(`\n最高跳跃 py=${highestJump.toFixed(1)} → 峰值时底沿 y=${clearanceNeeded.toFixed(1)}`)
console.log(`灯塔顶部 y=${spireTop}  →  ${clearanceNeeded > spireTop ? '跳不过去 ✔' : '仍可跳过 ✘'}`)
console.log(`安全余量 ${(clearanceNeeded - spireTop).toFixed(1)}px`)

// 灯塔能否被下潜躲开：下潜到最深时碰撞盒顶沿
{
  const g = mk()
  g.dive()
  for (let i = 0; i < 120; i++) g.update(CFG.MSPF)
  const box = g.hitbox()
  const ob = g.obstacleBox({ kind: 'spire', layer: 'surface', x: CFG.START_X - 15, w: spire.w, h: spire.h })
  const overlap = box.y < ob.y + ob.h && box.y + box.h > ob.y
  console.log(`\n最深下潜 py=${g.py.toFixed(1)}: 碰撞盒 y=${box.y.toFixed(0)}..${(box.y + box.h).toFixed(0)}`)
  console.log(`灯塔占用 y=${ob.y.toFixed(0)}..${(ob.y + ob.h).toFixed(0)}  →  ${overlap ? '会撞 ✘' : '可躲开 ✔'}`)
}
