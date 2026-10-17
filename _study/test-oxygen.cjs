/**
 * 氧气系统回归测试。
 *
 * 核心规格：**恢复时间是消耗时间的 2 倍**（消耗 1 秒 ⇒ 需要 2 秒回满）。
 * 另外验证：耗尽会强制上浮、锁定期间不能下潜、解锁后恢复可用、重开回满。
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
  if (spec === 'jsx-runtime') return { jsx: (t, p) => ({ type: t, props: p }) }
  if (spec === 'react/jsx-runtime') return { jsx: (t, p) => ({ type: t, props: p }) }
  throw new Error(spec)
})
const { WhaleJump, CFG } = mod.__engine

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
  // 氧气测试要隔离障碍：否则跑几百帧后会被随机障碍撞死，
  // over 之后 stepOxygen 不再结算，测出来的恢复时间会假性变成「永不恢复」。
  g.spawn = () => {}
  g.obstacles = []
  return g
}

const FRAME_MS = CFG.MSPF
const framesFor = (seconds) => Math.round((seconds * 1000) / FRAME_MS)

console.log('\n[1] 速率定义')
{
  const drainPerSec = CFG.OXY_DRAIN * CFG.FPS
  const recoverPerSec = CFG.OXY_RECOVER * CFG.FPS
  console.log(`    消耗 ${drainPerSec.toFixed(4)}/秒 → 满氧可用 ${(1 / drainPerSec).toFixed(2)}s`)
  console.log(`    恢复 ${recoverPerSec.toFixed(4)}/秒 → 回满需 ${(1 / recoverPerSec).toFixed(2)}s`)
  check('恢复速度正好是消耗的一半', Math.abs(recoverPerSec * 2 - drainPerSec) < 1e-12, `${recoverPerSec} vs ${drainPerSec / 2}`)
  check('满氧可下潜约 4 秒', Math.abs(1 / drainPerSec - 4) < 0.01, (1 / drainPerSec).toFixed(3))
  check('满氧回满约 8 秒', Math.abs(1 / recoverPerSec - 8) < 0.01, (1 / recoverPerSec).toFixed(3))
}

console.log('\n[2] 计时实测：消耗 1 秒后，恢复要 2 秒')
{
  // 口径说明：规格「恢复时间是消耗时间的 2 倍」指的是**纯恢复速率**。
  // 角色松开 ↓ 后还有一段上浮时间（约 0.6s），那段时间仍在水下、仍在消耗，
  // 不属于「恢复」。所以这里先从水下回到水面，再计时纯恢复段。
  const g = mk()
  g.dive()
  for (let i = 0; i < framesFor(1); i++) g.update(FRAME_MS)
  const after1s = g.oxygen
  console.log(`    消耗 1 秒后氧气 = ${after1s.toFixed(3)}`)

  // 先浮出水面（这段仍是消耗期）
  g.releaseDive()
  let surfacing = 0
  while (g.py < 0 && surfacing < framesFor(5)) { g.update(FRAME_MS); surfacing++ }
  const atSurface = g.oxygen
  console.log(`    浮出水面用时 ${(surfacing / CFG.FPS).toFixed(2)}s，此时氧气 ${atSurface.toFixed(3)}`)

  // 纯恢复段：从当前值回到 1
  const t0 = g.oxygen
  let rec = 0
  while (g.oxygen < 1 && rec < framesFor(30)) { g.update(FRAME_MS); rec++ }
  const recSec = rec / CFG.FPS
  const expected = (1 - t0) / (CFG.OXY_RECOVER * CFG.FPS)
  console.log(`    纯恢复 ${recSec.toFixed(2)}s（理论 ${expected.toFixed(2)}s）`)
  check('实际恢复时间与理论值一致', Math.abs(recSec - expected) < 0.06, `${recSec.toFixed(2)} vs ${expected.toFixed(2)}`)

  // 终极口径：把同样的氧气量「补回来」所需时间，应是「用掉它」所需时间的 2 倍
  const drained = 1 - atSurface
  const timeToDrain = drained / (CFG.OXY_DRAIN * CFG.FPS)
  const timeToRecover = drained / (CFG.OXY_RECOVER * CFG.FPS)
  console.log(
    `    用掉 ${drained.toFixed(3)} 需 ${timeToDrain.toFixed(2)}s，补回同样多需 ${timeToRecover.toFixed(2)}s`,
  )
  check('补回用时正好是消耗用时的 2 倍', Math.abs(timeToRecover - 2 * timeToDrain) < 1e-9, `${timeToRecover} vs ${2 * timeToDrain}`)
}

console.log('\n[3] 耗尽行为')
{
  const g = mk()
  g.dive()
  let frames = 0
  while (g.oxygen > 0 && frames < framesFor(10)) { g.update(FRAME_MS); frames++ }
  console.log(`    耗尽用时 ${(frames / CFG.FPS).toFixed(2)}s`)
  check('约 4 秒耗尽', Math.abs(frames / CFG.FPS - 4) < 0.15, (frames / CFG.FPS).toFixed(2))
  check('耗尽时氧气为 0', g.oxygen === 0)
  check('耗尽后进入锁定', g.oxyLocked === true)
  check('耗尽时取消下潜意图', g.diving === false)

  // 强制上浮：再跑几帧应该浮到水面
  for (let i = 0; i < framesFor(2); i++) g.update(FRAME_MS)
  check('耗尽后自动浮回水面', g.py === 0, 'py=' + g.py.toFixed(1))

  // 锁定期间不能下潜
  g.dive()
  check('锁定期间 dive() 无效', g.diving === false)
}

console.log('\n[4] 解锁')
{
  const g = mk()
  g.dive()
  while (g.oxygen > 0) g.update(FRAME_MS)
  g.releaseDive()

  // 恢复到 OXY_REARM 阈值
  let frames = 0
  while (g.oxyLocked && frames < framesFor(20)) { g.update(FRAME_MS); frames++ }
  console.log(`    解锁用时 ${(frames / CFG.FPS).toFixed(2)}s，氧气 ${g.oxygen.toFixed(2)}`)
  check('氧气回升后解锁', g.oxyLocked === false)
  check('解锁时氧气约 ' + CFG.OXY_REARM, Math.abs(g.oxygen - CFG.OXY_REARM) < 0.05, g.oxygen.toFixed(3))

  g.dive()
  check('解锁后可以再次下潜', g.diving === true)
}

console.log('\n[5] 满氧时不会无限累积')
{
  const g = mk()
  for (let i = 0; i < framesFor(5); i++) g.update(FRAME_MS)
  check('水面停留氧气封顶为 1', g.oxygen === 1, String(g.oxygen))
}

console.log('\n[6] 重开回满')
{
  const g = mk()
  g.dive()
  for (let i = 0; i < framesFor(2); i++) g.update(FRAME_MS)
  check('下潜后氧气下降', g.oxygen < 1)
  g.crash()
  g.restart()
  check('重开后氧气回满', g.oxygen === 1, String(g.oxygen))
  check('重开后解除锁定', g.oxyLocked === false)
}

console.log('\n[7] 帧率无关')
{
  const drainAt = (fps) => {
    const g = mk()
    g.dive()
    const step = 1000 / fps
    const n = Math.round((1000 * 1) / step)
    for (let i = 0; i < n; i++) g.update(step)
    return g.oxygen
  }
  const a = drainAt(60)
  const b = drainAt(144)
  console.log(`    60fps 剩余 ${a.toFixed(4)} | 144fps 剩余 ${b.toFixed(4)}`)
  check('不同帧率消耗一致（误差 <1%）', Math.abs(a - b) < 0.01, `${a.toFixed(4)} vs ${b.toFixed(4)}`)
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`)
process.exit(fail === 0 ? 0 : 1)
