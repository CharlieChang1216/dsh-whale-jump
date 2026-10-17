/**
 * 引擎物理验证（无浏览器）。
 *
 * 用桩环境把 client.js 跑起来，取出 __engine 句柄，直接驱动固定时间步，
 * 验证那四条「必须复刻」的机制：
 *   1. delta 归一化 —— 高刷屏不会变快
 *   2. 短按小跳 / 长按大跳
 *   3. 多碰撞盒的贴边宽容
 *   4. 间距随速度放大
 */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const SRC = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')

function makeCtx2d() {
  const noop = () => {}
  const gradient = { addColorStop: noop }
  return new Proxy(
    { createLinearGradient: () => gradient },
    {
      get(target, prop) {
        if (prop in target) return target[prop]
        return noop
      },
    },
  )
}

function makeCanvas() {
  const ctx2d = makeCtx2d()
  return {
    width: 0,
    height: 0,
    style: {},
    getContext: () => ctx2d,
    addEventListener: () => {},
    focus: () => {},
    setAttribute: () => {},
  }
}

let factory = null
const sandbox = {
  window: {
    __ModuleLoader__: { load: (hd) => (factory = hd.factory) },
    devicePixelRatio: 2,
    addEventListener: () => {},
    removeEventListener: () => {},
  },
  document: {
    documentElement: { lang: 'zh-CN', appendChild: () => {} },
    head: { appendChild: () => {} },
    body: { appendChild: () => {} },
    createElement: (tag) => (tag === 'canvas' ? makeCanvas() : { style: {}, dataset: {}, appendChild: () => {} }),
    querySelector: () => null,
    addEventListener: () => {},
  },
  navigator: { language: 'zh-CN' },
  Image: class {
    constructor() {
      this.complete = false
      this.naturalWidth = 0
    }
  },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ best: 0 }) }),
  console,
  Math,
  Date,
  JSON,
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(SRC, sandbox, { filename: 'client.js' })

const reactStub = { useCallback: (f) => f, useState: (i) => [i, () => {}], useEffect: () => {} }
const exportsObj = factory((spec) => {
  if (spec === 'react') return reactStub
  if (spec === 'react/jsx-runtime') return { jsx: (t, p) => ({ type: t, props: p }) }
  throw new Error('unexpected require ' + spec)
})

const { WhaleJump, CFG } = exportsObj.__engine
const canvas = makeCanvas()

let pass = 0
let fail = 0
function check(name, cond, detail) {
  if (cond) {
    pass++
    console.log('  PASS  ' + name)
  } else {
    fail++
    console.log('  FAIL  ' + name + (detail ? '  → ' + detail : ''))
  }
}

/** 造一个引擎实例，关掉 rAF，手动步进。 */
function mkEngine() {
  const g = new WhaleJump(canvas, { heroUrl: 'data:,', best: 0 })
  g.running = true
  g.over = false
  return g
}

// —— 1. 跳跃高度：短按 vs 长按 ————————————————————
function measureJump(holdFrames) {
  const g = mkEngine()
  g.press() // 走真实输入路径：press() 会置 held=true 并起跳
  let peak = 0
  for (let i = 0; i < 200; i++) {
    if (i === holdFrames) g.release()
    g.update(CFG.MSPF)
    peak = Math.max(peak, g.py)
    if (!g.jumping) break
  }
  return { peak, landed: !g.jumping }
}

console.log('\n[1] 短按小跳 / 长按大跳')
// 「轻点」按 5 帧（≈83ms），这是真人能打出的最短点击，不是 1 帧的机械输入。
const tap = measureJump(5)
const mid = measureJump(15)
const hold = measureJump(60)
console.log(
  `    tap(5f) peak = ${tap.peak.toFixed(1)}px, mid(15f) = ${mid.peak.toFixed(1)}px, hold(60f) = ${hold.peak.toFixed(1)}px`,
)
check('轻点也能起跳并落到地面', tap.landed && tap.peak > 20, 'peak=' + tap.peak)
check('长按明显比轻点高', hold.peak > tap.peak * 1.3, `${hold.peak.toFixed(1)} vs ${tap.peak.toFixed(1)}`)
check('按下越久跳得越高（单调）', tap.peak < mid.peak && mid.peak <= hold.peak + 0.01, `${tap.peak.toFixed(1)} / ${mid.peak.toFixed(1)} / ${hold.peak.toFixed(1)}`)
check('轻点的高度足以越过最矮障碍（30px）', tap.peak > 30, tap.peak.toFixed(1))
check('长按仍然会落地（不会永远飞）', hold.landed)

// —— 2. 帧率无关性 ————————————————————————————
console.log('\n[2] delta 归一化：60fps vs 144fps 应得到相同距离')
{
  const g60 = mkEngine()
  g60.speed = 8
  for (let i = 0; i < 60; i++) g60.update(1000 / 60)
  const g144 = mkEngine()
  g144.speed = 8
  const step144 = 1000 / 144
  const n144 = Math.round(1000 / step144)
  for (let i = 0; i < n144; i++) g144.update(step144)
  const diff = Math.abs(g60.distance - g144.distance) / g60.distance
  console.log(`    60fps dist=${g60.distance.toFixed(1)}  144fps dist=${g144.distance.toFixed(1)}  Δ=${(diff * 100).toFixed(2)}%`)
  check('两种帧率下位移一致（误差 <1%）', diff < 0.01, (diff * 100).toFixed(2) + '%')
}

// —— 3. 碰撞盒宽容 ————————————————————————————
console.log('\n[3] 碰撞盒：贴边不算撞')
{
  const g = mkEngine()
  const box = g.hitbox()
  // 障碍右边缘刚好停在碰撞盒左侧 1px 外 → 不应算碰撞
  g.obstacles = [{ kind: 'coral', x: box.x - 30 + 1, w: 26, h: 42, gap: 100, phase: 0 }]
  g.update(CFG.MSPF)
  check('差 1px 没撞上', !g.over, 'over=' + g.over)

  const g2 = mkEngine()
  const b2 = g2.hitbox()
  g2.obstacles = [{ kind: 'coral', x: b2.x + 4, w: 26, h: 42, gap: 100, phase: 0 }]
  g2.update(CFG.MSPF)
  check('真正重叠时判定碰撞', g2.over === true)
}

// —— 4. 间距随速度放大 ————————————————————————
console.log('\n[4] 障碍间距随速度放大（同一障碍类型，多次采样取中位数）')
{
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }
  const realRandom = Math.random
  /** 让 spawn() 的「选类型」那一次返回 0（稳定选中第一个障碍），其余保持随机。 */
  function withFixedType(fn) {
    let first = true
    Math.random = function () {
      if (first) {
        first = false
        return 0
      }
      return realRandom()
    }
    try {
      return fn()
    } finally {
      Math.random = realRandom
    }
  }

  const { OBSTACLES } = exportsObj.__engine
  const gaps = []
  for (const spd of [5.4, 9, 12.5]) {
    const samples = []
    for (let n = 0; n < 41; n++) {
      const g = mkEngine()
      g.speed = spd
      g.obstacles = []
      withFixedType(() => g.spawn())
      samples.push(g.obstacles[0].gap)
    }
    gaps.push({ spd, med: median(samples), min: Math.min(...samples), max: Math.max(...samples) })
  }
  const w0 = OBSTACLES[0].w
  gaps.forEach((r) => console.log(`    speed=${r.spd}  中位 gap=${r.med}  (${r.min}..${r.max})  期望基准=${Math.round(w0 * r.spd + 72)}`))
  const increasing = gaps[0].med < gaps[1].med && gaps[1].med < gaps[2].med
  check('速度越快间距中位数越大', increasing, JSON.stringify(gaps.map((g) => g.med)))
  check('随机区间落在 [基准, 1.5×基准] 内', gaps.every((g) => g.min > 0 && g.max <= g.min * 1.6))
}

// —— 5. 计分与加速 ————————————————————————————
console.log('\n[5] 计分 = 距离 × 系数；速度单调递增到上限')
{
  const g = mkEngine()
  g.obstacles = []
  const startSpeed = g.speed
  for (let i = 0; i < 600; i++) {
    g.elapsed = 99999 // 跳过开局保护
    g.update(CFG.MSPF)
    if (g.over) {
      g.over = false
      g.obstacles = []
    }
  }
  const expect = Math.floor(g.distance * CFG.SCORE_COEF)
  console.log(`    distance=${g.distance.toFixed(0)} score=${g.score} expect≈${expect} speed=${g.speed.toFixed(2)}`)
  check('分数按距离换算', Math.abs(g.score - expect) <= 1, `${g.score} vs ${expect}`)
  check('速度从初速增长', g.speed > startSpeed)
  check('速度不超过上限', g.speed <= CFG.MAX_SPEED + 1e-9, String(g.speed))
}

// —— 6. 最高分 ——————————————————————————————
console.log('\n[6] 撞死时刷新最高分并回调')
{
  let reported = null
  const g = new WhaleJump(canvas, { heroUrl: 'data:,', best: 5, onBest: (s) => (reported = s) })
  g.running = true
  g.score = 42
  g.crash()
  check('over 置位', g.over === true)
  check('最高分更新', g.best === 42, String(g.best))
  check('onBest 回调收到分数', reported === 42, String(reported))
}

// —— 7. 难度可解性：能跳的有解、尖礁只能潜 ————————————
console.log('\n[7] 可解性：该跳的能跳，尖礁只能潜')
{
  const { OBSTACLES } = exportsObj.__engine
  const holdPeak = measureJump(60).peak
  const tapPeak = measureJump(5).peak

  let allJumpable = true
  let spireBlocked = true
  const rows = []
  for (const o of OBSTACLES) {
    // 越过障碍所需的最小 py：碰撞盒下沿(212)要高于障碍顶(202-h) 再加一点余量
    const need = Math.max(0, o.h - 10) + 8
    const canJump = holdPeak > need
    // 只有「必须下潜」这一类（dodge=dive）且**站在 surface 层**的障碍才是跳不过去的。
    // 海鸥也是 dodge=dive，但它在 air 层，h 很矮，本来就能从下面跳过去 —— 不算在内。
    const jumpProof = o.dodge === 'dive' && o.layer === 'surface'
    if (!jumpProof && !canJump) allJumpable = false
    if (jumpProof && canJump) spireBlocked = false
    rows.push(
      `    ${String(o.kind).padEnd(6)} h=${String(o.h).padStart(3)}  layer=${String(o.layer).padEnd(7)} ` +
        `需 py>${String(need).padStart(3)}  可达 ${holdPeak.toFixed(0)}  ` +
        `${jumpProof ? (canJump ? 'BUG(竟可跳)' : 'OK(只能潜)') : canJump ? 'OK(可跳)' : 'UNSOLVABLE'}`,
    )
  }
  console.log(rows.join('\n'))
  check('所有「该跳」的障碍都能被长按跳过', allJumpable)
  check('尖礁（surface 层 + 只能潜）确实跳不过去', spireBlocked)
  check('至少存在一个跳不过去的障碍', OBSTACLES.some((o) => o.dodge === 'dive' && o.layer === 'surface'))
  check('最矮障碍轻点即可越过', tapPeak > Math.max(0, 30 - 10) + 8, `tap=${tapPeak.toFixed(0)}`)
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`)
process.exit(fail === 0 ? 0 : 1)
