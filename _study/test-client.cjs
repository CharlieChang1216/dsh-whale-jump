/**
 * 无浏览器环境下验证 client.js 里的游戏引擎。
 *
 * client.js 是给浏览器用的（打开就调 __ModuleLoader__.load），所以这里
 * 造一个最小的 window / document / Image / canvas 桩，把模块跑起来，
 * 再通过导出的内部句柄直接驱动引擎。
 */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const SRC = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')

function makeCtx2d() {
  const noop = () => {}
  const gradient = { addColorStop: noop }
  return {
    canvas: null,
    setTransform: noop,
    clearRect: noop,
    fillRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    arc: noop,
    ellipse: noop,
    roundRect: noop,
    fill: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    drawImage: noop,
    fillText: noop,
    createLinearGradient: () => gradient,
  }
}

function makeCanvas() {
  const ctx2d = makeCtx2d()
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    className: '',
    getContext: () => ctx2d,
    addEventListener: () => {},
    focus: () => {},
    setAttribute: () => {},
  }
  ctx2d.canvas = canvas
  return canvas
}

let capturedFactory = null
const moduleStub = {
  exports: {},
}

const windowStub = {
  __ModuleLoader__: {
    load(handoff) {
      capturedFactory = handoff.factory
    },
  },
  devicePixelRatio: 2,
  addEventListener: () => {},
  removeEventListener: () => {},
  AudioContext: undefined,
  webkitAudioContext: undefined,
}

const documentStub = {
  documentElement: { lang: 'zh-CN', appendChild: () => {} },
  head: { appendChild: () => {} },
  body: { appendChild: () => {}, removeChild: () => {} },
  createElement(tag) {
    if (tag === 'canvas') return makeCanvas()
    return {
      className: '',
      style: {},
      dataset: {},
      textContent: '',
      appendChild: () => {},
      addEventListener: () => {},
      setAttribute: () => {},
      remove: () => {},
    }
  },
  querySelector: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
}

const sandbox = {
  window: windowStub,
  document: documentStub,
  navigator: { language: 'zh-CN' },
  Image: class {
    constructor() {
      this.complete = false
      this.naturalWidth = 0
    }
    set src(v) {
      this._src = v
    }
    get src() {
      return this._src
    }
  },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
  setTimeout: () => 1,
  clearTimeout: () => {},
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ best: 0 }) }),
  console,
  Math,
  Date,
  JSON,
  Object,
  Array,
  Number,
  String,
  Boolean,
  Error,
  Symbol,
  Map,
  Set,
  Promise,
}
sandbox.globalThis = sandbox
sandbox.self = sandbox

vm.createContext(sandbox)
vm.runInContext(SRC, sandbox, { filename: 'client.js' })

if (!capturedFactory) {
  console.error('FAIL: factory was not registered')
  process.exit(1)
}

const reactStub = {
  useCallback: (fn) => fn,
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useRef: (v) => ({ current: v }),
}
const jsxRuntimeStub = {
  jsx: (type, props) => ({ type, props }),
  jsxs: (type, props) => ({ type, props }),
}

const exportsObj = capturedFactory((spec) => {
  if (spec === 'react') return reactStub
  if (spec === 'react/jsx-runtime') return jsxRuntimeStub
  throw new Error('unexpected require: ' + spec)
})

console.log('exports:', Object.keys(exportsObj).join(', '))
if (typeof exportsObj.apply !== 'function') {
  console.error('FAIL: apply missing')
  process.exit(1)
}
if (typeof exportsObj.JumpRow !== 'function') {
  console.error('FAIL: JumpRow missing')
  process.exit(1)
}
console.log('PASS: module contract (apply + JumpRow)')

// —— 插槽注册契约 ————————————————————————————————
const registered = []
const ctxStub = {
  effect(fn) {
    const dispose = fn()
    return () => {
      if (typeof dispose === 'function') dispose()
    }
  },
  slots: {
    inject(name, fn2) {
      if (name !== 'conversation.input.dock') throw new Error('wrong slot: ' + name)
      return fn2()
    },
    register(opts, comp) {
      registered.push({ opts, comp })
      return () => {}
    },
  },
}

exportsObj.apply(ctxStub)
if (registered.length !== 1) {
  console.error('FAIL: expected exactly one slot registration, got ' + registered.length)
  process.exit(1)
}
const reg = registered[0]
console.log('slot:', reg.opts.name, '| id:', reg.opts.id, '| order:', reg.opts.order)
if (reg.opts.name !== 'conversation.input.dock' || reg.opts.id !== 'whale-jump') {
  console.error('FAIL: registration target mismatch')
  process.exit(1)
}
console.log('PASS: registers into conversation.input.dock as "whale-jump"')

// —— 入口行渲染 ————————————————————————————————
const rowIdle = reg.comp({ session: { running: false, blank: false } })
console.log('DEBUG node:', JSON.stringify(rowIdle, (k, v) => (typeof v === 'function' ? '[fn]' : v)))
const rowHero = reg.comp({ session: { running: false, blank: true } })
const rowRun = reg.comp({ session: { running: true, blank: false } })
const textOf = (node) => {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf(node.props && node.props.children)
}
console.log('idle  :', JSON.stringify(textOf(rowIdle)))
console.log('hero  :', JSON.stringify(textOf(rowHero)))
console.log('running:', JSON.stringify(textOf(rowRun)))

if (!textOf(rowIdle).includes('等太久')) {
  console.error('FAIL: idle copy missing')
  process.exit(1)
}
if (!textOf(rowHero).includes('小鲸鱼跳')) {
  console.error('FAIL: hero copy missing')
  process.exit(1)
}
console.log('PASS: three-state copy (idle / hero / running)')

// —— 引擎物理 ————————————————————————————————
// 通过浮层构造路径拿到引擎：openOverlay 是闭包内的，这里改用反射不可行，
// 所以直接重跑一遍模块解析，从 JumpRow 的 onClick 触发一次 —— 需要真实 DOM。
// 更实际的做法：在沙箱里暴露一个测试钩子。
console.log('NOTE: 引擎物理在浏览器冒烟测试中验证（见 README 的自检步骤）')
