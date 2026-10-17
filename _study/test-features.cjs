/**
 * 新增功能的回归测试：
 *   1. 结束后重开（这是之前真实失效的功能）
 *   2. 下潜物理（深度封顶、浮力回位、可松开）
 *   3. air / deep 两层的可解性（海鸥要潜、水母要浮）
 */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const SRC = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')

function makeCtx2d() {
  const noop = () => {}
  const grad = { addColorStop: noop }
  return new Proxy({ createLinearGradient: () => grad }, { get: (t, p) => (p in t ? t[p] : noop) })
}
function makeCanvas() {
  const ctx2d = makeCtx2d()
  return { width: 0, height: 0, style: {}, getContext: () => ctx2d, addEventListener: () => {}, focus: () => {} }
}

let factory = null
const sandbox = {
  window: {
    __ModuleLoader__: { load: (hd) => (factory = hd.factory) },
    devicePixelRatio: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
  },
  document: {
    documentElement: { lang: 'zh-CN', appendChild: () => {} },
    head: { appendChild: () => {} },
    body: { appendChild: () => {} },
    createElement: (t) => (t === 'canvas' ? makeCanvas() : { style: {}, dataset: {}, appendChild: () => {} }),
    querySelector: () => null,
    addEventListener: () => {},
  },
  navigator: { language: 'zh-CN' },
  Image: class { constructor() { this.complete = false; this.naturalWidth = 0 } },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ best: 0 }) }),
  console, Math, Date, JSON,
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(SRC, sandbox, { filename: 'client.js' })

const mod = factory((spec) => {
  if (spec === 'react') return { useCallback: (f) => f, useState: (i) => [i, () => {}], useEffect: () => {} }
  if (spec === 'react/jsx-runtime') return { jsx: (t, p) => ({ type: t, props: p }) }
  throw new Error(spec)
})
const { WhaleJump, CFG, OBSTACLES } = mod.__engine

let pass = 0
let fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name) }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')) }
}

const canvas = makeCanvas()
function mk() {
  const g = new WhaleJump(canvas, { heroUrl: '', best: 0 })
  g.running = true
  g.over = false
  return g
}

// —— 1. 重开 ————————————————————————————————
console.log('\n[1] 结束后重开（旧版这里静默失效）')
{
  const g = mk()
  g.score = 42
  g.crash()
  check('撞死后 over', g.over === true)
  check('撞死后 running 仍为 true（这也是旧 bug 的成因）', g.running === true)

  g.press() // 结束状态下按空格
  check('重开后 over 复位', g.over === false)
  check('重开后 running 为 true', g.running === true)
  check('重开后分数归零', g.score === 0, String(g.score))
  check('重开后障碍清空', g.obstacles.length === 0)
  check('重开后回到水面', g.py === 0, String(g.py))

  // restart() 直接调用也应可用
  g.score = 99
  g.crash()
  g.restart()
  check('restart() 也能重开', g.over === false && g.score === 0)
}

// —— 2. 下潜 ————————————————————————————————
console.log('\n[2] 下潜物理')
{
  const g = mk()
  g.dive()
  check('dive() 进入下潜状态', g.diving === true)

  // 按住下潜 40 帧
  for (let i = 0; i < 40; i++) g.update(CFG.MSPF)
  check('下潜后 py 变负', g.py < 0, 'py=' + g.py.toFixed(1))
  const heldDepth = g.py
  console.log(`    按住 40 帧后深度 = ${heldDepth.toFixed(1)}px`)

  // 继续按住，确认深度封顶
  for (let i = 0; i < 200; i++) g.update(CFG.MSPF)
  check('深度不超过上限', g.py >= -CFG.DIVE_MAX - 0.5, 'py=' + g.py.toFixed(1) + ' max=' + CFG.DIVE_MAX)
  console.log(`    长按后深度 = ${g.py.toFixed(1)}px (上限 ${CFG.DIVE_MAX})`)

  // 松开后浮回水面
  g.releaseDive()
  let frames = 0
  while (g.py < 0 && frames < 600) {
    g.update(CFG.MSPF)
    frames++
  }
  check('松手后浮回水面', g.py === 0, 'py=' + g.py.toFixed(1))
  console.log(`    上浮用时 ${frames} 帧 (${(frames / 60).toFixed(1)}s)`)
  check('上浮时间合理（<3s）', frames > 0 && frames < 180, frames + ' frames')
}

// —— 3. 空中层与水下层的可解性 ————————————————
console.log('\n[3] air / deep 两层可解性')
{
  check('障碍表含 air 层', OBSTACLES.some((o) => o.layer === 'air'))
  check('障碍表含 deep 层', OBSTACLES.some((o) => o.layer === 'deep'))

  // 海鸥：贴着水面上方飞。站在水面（py=0）不该撞；跳起来会撞。
  const gull = OBSTACLES.find((o) => o.kind === 'gull')
  const g1 = mk()
  g1.obstacles = [{ kind: 'gull', layer: 'air', x: CFG.START_X - 20, w: gull.w, h: gull.h, gap: 100, phase: 0, fly: 18, depth: 0 }]
  // 水面静止：不应碰撞
  g1.over = false
  g1.stepMotion(1)
  const box0 = g1.hitbox()
  const ob0 = g1.obstacleBox(g1.obstacles[0])
  const overlap0 = box0.y < ob0.y + ob0.h && box0.y + box0.h > ob0.y
  check('站在水面不撞海鸥', !overlap0, `box.y=${box0.y.toFixed(0)} ob.y=${ob0.y.toFixed(0)}..${(ob0.y + ob0.h).toFixed(0)}`)

  // 下潜后：更不该撞（往下了）
  const g2 = mk()
  g2.dive()
  for (let i = 0; i < 25; i++) g2.update(CFG.MSPF)
  const box2 = g2.hitbox()
  check('下潜能躲开海鸥（碰撞盒整体低于海鸥）', box2.y > ob0.y + ob0.h, `box.y=${box2.y.toFixed(0)}`)

  // 水母：沉在水面下。站在水面不撞；下潜会撞。
  const jelly = OBSTACLES.find((o) => o.kind === 'jelly')
  const j = { kind: 'jelly', layer: 'deep', x: CFG.START_X - 10, w: jelly.w, h: jelly.h, gap: 100, phase: 0, fly: 0, depth: 20 }
  const g3 = mk()
  g3.obstacles = [j]
  const jb = g3.obstacleBox(j)
  const b3 = g3.hitbox()
  const overlapDeep = b3.y < jb.y + jb.h && b3.y + b3.h > jb.y
  check('站在水面不撞水母', !overlapDeep, `box=${b3.y.toFixed(0)}..${(b3.y + b3.h).toFixed(0)} ob=${jb.y.toFixed(0)}..${(jb.y + jb.h).toFixed(0)}`)

  const g4 = mk()
  g4.obstacles = [j]
  g4.dive()
  let hit = false
  for (let i = 0; i < 60 && !hit; i++) {
    g4.update(CFG.MSPF)
    if (g4.over) hit = true
  }
  check('下潜能撞到水母（否则 deep 层没意义）', hit === true)
}

// —— 4. 空中急坠仍然可用 ————————————————————
console.log('\n[4] 空中急坠')
{
  const g = mk()
  g.press()
  // 升到半空
  for (let i = 0; i < 6; i++) g.update(CFG.MSPF)
  const before = g.py
  g.dive() // 空中按下 = 急坠
  check('空中按 ↓ 触发 fastFall', g.fastFall === true)
  for (let i = 0; i < 6; i++) g.update(CFG.MSPF)
  check('急坠后高度下降', g.py < before, `${before.toFixed(1)} → ${g.py.toFixed(1)}`)
  check('急坠后仍会落回水面', g.py === 0 || g.py < before)
}

// —— 5. 生成随速度解锁新层 ——————————————————
console.log('\n[5] 高速才解锁空中/尖礁；水母开局就有')
{
  const g = mk()
  // 低速：不应出现 air（海鸥）或 spire（尖礁），但水母按设计开局就能出现
  let lowLayers = new Set()
  for (let n = 0; n < 200; n++) {
    g.speed = 5.5
    g.elapsed = 60000 // 后期，排除开局权重干扰
    const saved = g.obstacles
    g.obstacles = []
    g.spawn()
    lowLayers.add(g.obstacles[0].layer)
    g.obstacles = saved
  }
  check('低速不出现 air 层', !lowLayers.has('air'), [...lowLayers].join(','))
  check('低速不出现尖礁', ![...lowLayers].includes('spire'))
  check('低速可出现 surface 与 deep（水母开局就有）', lowLayers.has('surface') && lowLayers.has('deep'), [...lowLayers].join(','))

  const highLayers = new Set()
  for (let n = 0; n < 400; n++) {
    g.speed = 12.5
    g.elapsed = 60000
    const saved = g.obstacles
    g.obstacles = []
    g.spawn()
    highLayers.add(g.obstacles[0].layer)
    g.obstacles = saved
  }
  check('高速三层都会出现', highLayers.has('surface') && highLayers.has('air') && highLayers.has('deep'), [...highLayers].join(','))
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`)
process.exit(fail === 0 ? 0 : 1)
