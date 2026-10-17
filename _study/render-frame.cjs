/**
 * 把游戏画面渲染成 PNG，用来肉眼验收。
 *
 * 用 @napi-rs/canvas 不一定可用，所以退而求其次：把 draw 调用录下来，
 * 用 Python/Pillow 重放。这样不引新依赖也能看到真实布局。
 */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const SRC = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')

// 录制器：把 canvas 2D 调用序列化成 JSON，交给 Pillow 重放
let ops = []
let lastSave = []
const gradientStub = (kind, coords) => ({
  __grad: true,
  kind,
  coords,
  stops: [],
  addColorStop(off, color) {
    this.stops.push([off, color])
  },
})

function makeCtx2d() {
  const state = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    font: '10px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    lineCap: 'butt',
  }
  const transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  const stack = []
  // 当前路径（录制侧自己维护，fill/stroke 时一起快照下来）
  let path = []
  const ctx = {
    canvas: null,
    setTransform(a, b, c, d, e, f) {
      transform.a = a; transform.b = b; transform.c = c
      transform.d = d; transform.e = e; transform.f = f
      ops.push({ op: 'setTransform', transform: { ...transform } })
    },
    clearRect() { ops.push({ op: 'clear' }) },
    fillRect(x, y, w, h) { ops.push({ op: 'fillRect', x, y, w, h, fill: fillOf(ctx.fillStyle) }) },    beginPath() { path = []; ops.push({ op: 'beginPath' }) },
    closePath() { ops.push({ op: 'closePath' }) },
    moveTo(x, y) { path.push(['m', x, y]); ops.push({ op: 'moveTo', x, y }) },
    lineTo(x, y) { path.push(['l', x, y]); ops.push({ op: 'lineTo', x, y }) },
    quadraticCurveTo(cx, cy, x, y) { path.push(['q', cx, cy, x, y]); ops.push({ op: 'quad', cx, cy, x, y }) },
    arc(x, y, r) { ops.push({ op: 'arc', x, y, r, fill: fillOf(ctx.fillStyle), alpha: ctx.globalAlpha }) },
    ellipse(x, y, rx, ry) { ops.push({ op: 'ellipse', x, y, rx, ry, fill: fillOf(ctx.fillStyle), alpha: ctx.globalAlpha }) },
    roundRect(x, y, w, h, r) {
      ops.push({ op: 'roundRect', x, y, w, h, r, fill: fillOf(ctx.fillStyle), alpha: ctx.globalAlpha })
    },
    fill() {
      // 把当前路径点一并记下来：重放器不必自己维护路径状态机（那很容易出作用域 bug）
      ops.push({
        op: 'fill',
        fill: fillOf(ctx.fillStyle),
        alpha: ctx.globalAlpha,
        pts: path.map((p) => p.slice()),
      })
    },
    stroke() {
      ops.push({
        op: 'stroke',
        stroke: fillOf(ctx.strokeStyle),
        lw: ctx.lineWidth,
        alpha: ctx.globalAlpha,
        pts: path.map((p) => p.slice()),
        close: false,
      })
    },
    save() {
      stack.push({ ...state, transform: { ...transform } })
      ops.push({ op: 'save' })
    },
    restore() {
      const s = stack.pop()
      if (s) Object.assign(state, s)
      ops.push({ op: 'restore' })
    },
    // 裁剪路径：录制时只记录，重放时按「整帧裁剪」近似（灯塔条纹够看）
    clip() { ops.push({ op: 'clip' }) },
    translate(x, y) { ops.push({ op: 'translate', x, y }) },
    rotate(a) { ops.push({ op: 'rotate', a }) },
    scale(x, y) { ops.push({ op: 'scale', x, y }) },
    drawImage(img, dx, dy, dw, dh) { ops.push({ op: 'image', dx, dy, dw, dh }) },
    fillText(t, x, y) { ops.push({ op: 'text', t, x, y, fill: fillOf(ctx.fillStyle), font: ctx.font, align: ctx.textAlign, baseline: ctx.textBaseline, alpha: ctx.globalAlpha }) },
    createLinearGradient(x0, y0, x1, y1) { return gradientStub('linear', [x0, y0, x1, y1]) },
  }
  // style properties need getters/setters to be recorded
  for (const key of ['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'font', 'textAlign', 'textBaseline', 'lineCap']) {
    Object.defineProperty(ctx, key, {
      get() { return state[key] },
      set(v) { state[key] = v },
    })
  }
  return ctx
}

function fillOf(v) {
  if (v && v.__grad) return { grad: v.kind, coords: v.coords, stops: v.stops }
  return v
}

function makeCanvas() {
  const ctx2d = makeCtx2d()
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    getContext: () => ctx2d,
    addEventListener: () => {},
    focus: () => {},
    setAttribute: () => {},
  }
  ctx2d.canvas = canvas
  return canvas
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
const { WhaleJump, CFG } = mod.__engine

const canvas = makeCanvas()
const g = new WhaleJump(canvas, { heroUrl: '', best: 137 })
g.running = true

// 摆一个「刚起跳、正越过珊瑚」的瞬间
for (let i = 0; i < 140; i++) {
  g.elapsed = 9000 // 跳过开局保护期
  if (i === 100) g.press()
  g.update(CFG.MSPF)
  if (g.over) { g.over = false; g.obstacles = [] }
}
// 摆一个「遇到灯塔、正在下潜绕过」的瞬间
g.obstacles = [
  { kind: 'spire', layer: 'surface', dodge: 'dive', x: 320, w: 34, h: 128, gap: 200, phase: 0.8, fly: 0, depth: 0 },
  { kind: 'jelly', layer: 'deep', dodge: 'stay', x: 580, w: 30, h: 34, gap: 200, phase: 2, fly: 0, depth: 22 },
]
// 让角色处于下潜状态，并把氧气压到低值以看警告配色
g.jumping = false
g.dive()
for (let i = 0; i < 16; i++) g.stepMotion(1)
g.oxygen = 0.22

ops = []
g.draw()

fs.writeFileSync(path.join(__dirname, 'frame.json'), JSON.stringify({ W: CFG.W, H: CFG.H, ops }, null, 0))
console.log('recorded ops:', ops.length, '->', path.join(__dirname, 'frame.json'))
console.log('char py =', g.py.toFixed(1), ' jumping =', g.jumping, ' diving =', g.diving)
console.log('waterY =', CFG.WATER_Y)
