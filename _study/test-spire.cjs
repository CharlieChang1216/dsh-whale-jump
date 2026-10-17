/**
 * 灯塔（跳不过去的障碍）+ 水母初期频率 的回归测试。
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

let pass = 0
let fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name) }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')) }
}

const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx2d, addEventListener: noop, focus: noop }
function mk() {
  const g = new WhaleJump(canvas, { heroUrl: '', best: 0 })
  g.running = true
  g.over = false
  g.spawn = () => {}
  g.obstacles = []
  return g
}

console.log('\n[1] 灯塔：跳不过去')
{
  const spire = OBSTACLES.find((o) => o.kind === 'spire')
  check('障碍表里有灯塔', !!spire)
  check('灯塔很高（>100px）', spire.h > 100, String(spire.h))
  check('灯塔要求下潜躲避', spire.dodge === 'dive')

  // 在全部速度区间里，跳跃峰值都不能越过灯塔
  const waterY = CFG.WATER_Y
  const top = waterY - spire.h
  let allBlocked = true
  const rows = []
  for (const spd of [CFG.SPEED, 8, 10, CFG.MAX_SPEED]) {
    const g = mk()
    g.speed = spd
    g.press()
    let peak = 0
    for (let i = 0; i < 250; i++) {
      g.update(CFG.MSPF)
      peak = Math.max(peak, g.py)
      if (!g.jumping) break
    }
    const bottom = waterY + 10 - peak
    const blocked = bottom >= top
    if (!blocked) allBlocked = false
    rows.push(`    speed=${spd}: 峰值 py=${peak.toFixed(1)} 底沿 y=${bottom.toFixed(1)} vs 顶部 ${top} → ${blocked ? '跳不过去' : '可跳过'}`)
  }
  console.log(rows.join('\n'))
  check('所有速度下都跳不过去', allBlocked)
}

console.log('\n[2] 灯塔：下潜可以躲开')
{
  const spire = OBSTACLES.find((o) => o.kind === 'spire')
  const g = mk()
  g.dive()
  for (let i = 0; i < 150; i++) g.update(CFG.MSPF)
  const box = g.hitbox()
  const ob = g.obstacleBox({ kind: 'spire', layer: 'surface', x: CFG.START_X - 15, w: spire.w, h: spire.h })
  const overlap = box.y < ob.y + ob.h && box.y + box.h > ob.y
  console.log(`    最深时碰撞盒 y=${box.y.toFixed(0)}..${(box.y + box.h).toFixed(0)}，灯塔占 y=${ob.y.toFixed(0)}..${(ob.y + ob.h).toFixed(0)}`)
  check('下潜到最深可以躲开灯塔', !overlap)
}

console.log('\n[3] 水母：开局就出现，且初期频率更高')
{
  const jelly = OBSTACLES.find((o) => o.kind === 'jelly')
  check('水母无速度门槛（开局可出现）', !jelly.minSpeed || jelly.minSpeed === 0, String(jelly.minSpeed))
  check('水母带初期加成', (jelly.earlyBoost || 0) > 1, String(jelly.earlyBoost))

  // 统计固定速度下（排除速度对池子的影响）开局 vs 后期的抽取占比
  // 注意：mk() 把 spawn 换成了空函数（用于隔离障碍），这里要还原出真正的 spawn。
  const proto = Object.getPrototypeOf(mk())
  const realSpawn = proto.spawn
  function sample(elapsedMs, n) {
    const g = mk()
    g.speed = 6
    let jellies = 0
    for (let i = 0; i < n; i++) {
      g.obstacles = []
      g.elapsed = elapsedMs
      realSpawn.call(g)
      if (g.obstacles.length && g.obstacles[0].kind === 'jelly') jellies++
    }
    return jellies / n
  }
  const early = sample(3000, 3000)
  const late = sample(60000, 3000)
  console.log(`    开局(3s) 水母占比 ${(early * 100).toFixed(1)}%  后期(60s) ${(late * 100).toFixed(1)}%`)
  check('开局水母占比明显高于后期', early > late * 1.8, `${(early * 100).toFixed(1)}% vs ${(late * 100).toFixed(1)}%`)
  check('开局水母占比可观（>15%）', early > 0.15, (early * 100).toFixed(1) + '%')
}

console.log('\n[4] 相反动作的障碍要拉开间距')
{
  const proto = Object.getPrototypeOf(mk())
  const realSpawn = proto.spawn
  const realRandom = Math.random

  // 对比：前一个障碍同向 vs 反向，gap 的下限差异
  function gapFor(prevDodge) {
    let min = Infinity
    for (let n = 0; n < 400; n++) {
      const g = mk()
      g.speed = 10
      g.elapsed = 60000 // 后期，避免开局权重干扰
      g.obstacles = [{ kind: 'x', dodge: prevDodge, x: 100, w: 26, h: 44, gap: 100 }]
      realSpawn.call(g)
      const o = g.obstacles[g.obstacles.length - 1]
      if (o.dodge && o.dodge !== prevDodge) min = Math.min(min, o.gap / (o.w * 10 + 72))
    }
    return min
  }
  const oppositeRatio = gapFor('jump')
  console.log(`    相反动作时 gap / 基准 的最小比值 = ${oppositeRatio.toFixed(2)}`)
  check('相反动作时间距被放大（倍率 ≥1.7）', oppositeRatio >= CFG.OPPOSITE_GAP_MULT * 0.99, String(oppositeRatio))
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`)
process.exit(fail === 0 ? 0 : 1)
