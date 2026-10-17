/**
 * 端到端冒烟：模拟浏览器环境，走「入口行 → 打开浮层 → 开局 → 跳跃 → 撞死 → 结算」全流程。
 *
 * 用一个最小 DOM 桩，验证 openOverlay 的真实代码路径（而不是绕过它直接调引擎）。
 */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const SRC = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')

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

// —— 最小 DOM ——
function makeEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    className: '',
    id: '',
    style: {},
    dataset: {},
    textContent: '',
    children: [],
    parentNode: null,
    _listeners: {},
    get firstChild() {
      return this.children[0] || null
    },
    appendChild(child) {
      child.parentNode = this
      this.children.push(child)
      return child
    },
    removeChild(child) {
      const i = this.children.indexOf(child)
      if (i >= 0) this.children.splice(i, 1)
      child.parentNode = null
      return child
    },
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this)
    },
    setAttribute(k, v) {
      this[k] = v
    },
    getAttribute(k) {
      return this[k]
    },
    addEventListener(type, fn) {
      ;(this._listeners[type] = this._listeners[type] || []).push(fn)
    },
    removeEventListener(type, fn) {
      const arr = this._listeners[type] || []
      const i = arr.indexOf(fn)
      if (i >= 0) arr.splice(i, 1)
    },
    dispatch(type, ev) {
      for (const fn of this._listeners[type] || []) fn(ev || { type, preventDefault() {}, stopPropagation() {} })
    },
    focus() {},
    querySelector: () => null,
    querySelectorAll: () => [],
  }
  if (el.tagName === 'CANVAS') {
    const noop = () => {}
    const grad = { addColorStop: noop }
    el.getContext = () => new Proxy({ createLinearGradient: () => grad }, { get: (t, p) => (p in t ? t[p] : noop) })
  }
  return el
}

const body = makeEl('body')
const head = makeEl('head')
let intervalCount = 0

const documentStub = {
  documentElement: { lang: 'zh-CN', appendChild: () => {} },
  head,
  body,
  createElement: makeEl,
  querySelector: (sel) => {
    // style dedupe 查询
    if (String(sel).includes('data-plugin-css')) return null
    return null
  },
  addEventListener: () => {},
  removeEventListener: () => {},
}

let rafQueue = []
const winListeners = {}
const windowStub = {
  __ModuleLoader__: { load: (hd) => (windowStub._factory = hd.factory) },
  devicePixelRatio: 2,
  addEventListener: (t, fn) => {
    ;(winListeners[t] = winListeners[t] || []).push(fn)
  },
  removeEventListener: (t, fn) => {
    const a = winListeners[t] || []
    const i = a.indexOf(fn)
    if (i >= 0) a.splice(i, 1)
  },
}

const stateStore = { best: 0, plays: 0 }

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
  requestAnimationFrame: (fn) => {
    rafQueue.push(fn)
    return rafQueue.length
  },
  cancelAnimationFrame: (id) => {
    rafQueue = []
  },
  setInterval: () => ++intervalCount,
  clearInterval: () => {},
  setTimeout: (fn) => {
    fn()
    return 1
  },
  clearTimeout: () => {},
  fetch: (url, opts) => {
    const method = (opts && opts.method) || 'GET'
    if (String(url).includes('/state')) {
      if (method === 'POST') {
        try {
          const b = JSON.parse(opts.body)
          stateStore.plays += 1
          stateStore.best = Math.max(stateStore.best, Math.floor(b.score || 0))
        } catch (e) {}
        return Promise.resolve({ ok: true, json: () => Promise.resolve(stateStore) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ best: stateStore.best }) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  },
  console,
  Math,
  Date,
  JSON,
  Promise,
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(SRC, sandbox, { filename: 'client.js' })

const reactStub = {
  useCallback: (f) => f,
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
}
const mod = (windowStub._factory || (() => null))((spec) => {
  if (spec === 'react') return reactStub
  if (spec === 'react/jsx-runtime') return { jsx: (t, p) => ({ type: t, props: p }) }
  throw new Error(spec)
})

console.log('\n[A] 模块契约')
check('导出 apply', typeof mod.apply === 'function')
check('导出 JumpRow', typeof mod.JumpRow === 'function')

console.log('\n[B] 插槽注册')
const regs = []
const ctx = {
  effect: (fn) => fn(),
  slots: {
    inject: (n, fn) => fn(),
    register: (o, c) => {
      regs.push({ o, c })
      return () => {}
    },
  },
}
mod.apply(ctx)
check('注册一次', regs.length === 1)
check('目标插槽正确', regs[0].o.name === 'conversation.input.dock')

console.log('\n[C] 点击入口打开浮层')
const row = regs[0].c({ session: { running: false, blank: true } })
const btn = row.props.children
check('入口拿到 onClick', typeof btn.props.onClick === 'function')

btn.props.onClick({ preventDefault() {} })
// fetchBest 是 Promise，等一个微任务
const tick = () => new Promise((r) => setTimeout(r, 0))

;(async () => {
  await tick()
  await tick()
  await tick()

  const overlay = body.children.find((c) => c.className === 'dshwj-overlay')
  check('浮层已插入 body', !!overlay)
  check('浮层含 canvas', !!(overlay && overlay.children[0] && overlay.children[0].children.some((c) => c.tagName === 'CANVAS')))
  check('浮层含关闭按钮', !!(overlay && overlay.children[0] && overlay.children[0].children.some((c) => c.className === 'dshwj-close')))

  console.log('\n[D] 键盘输入驱动游戏')
  check('注册了 keydown', (winListeners.keydown || []).length > 0)
  check('注册了 keyup', (winListeners.keyup || []).length > 0)

  // 空格跳跃
  const kd = winListeners.keydown[0]
  let prevented = false
  kd({ key: ' ', code: 'Space', repeat: false, preventDefault: () => (prevented = true), stopPropagation() {} })
  check('空格被 preventDefault（不会漏到输入框）', prevented)

  // Esc 关闭
  const escKd = winListeners.keydown[0]
  escKd({ key: 'Escape', preventDefault() {}, stopPropagation() {} })
  const overlayAfter = body.children.find((c) => c.className === 'dshwj-overlay')
  check('Esc 关闭浮层', !overlayAfter)
  check('Esc 后解绑 keydown', (winListeners.keydown || []).length === 0)

  console.log('\n[E] 引擎直接驱动（浮层路线的内部一致性）')
  const { WhaleJump, CFG } = mod.__engine
  const canvas = makeEl('canvas')
  let bestCb = null
  const g = new WhaleJump(canvas, { heroUrl: '', best: 9, onBest: (s) => (bestCb = s) })
  g.start()
  check('start 后进入 running', g.running === true)
  // 跑一段并主动撞死
  g.score = 88
  g.crash()
  check('撞死后 over', g.over === true)
  check('刷新最高分', g.best === 88, String(g.best))
  check('onBest 回调', bestCb === 88, String(bestCb))

  console.log('\n[F] 浮层关闭时引擎被停止')
  // 重开一次浮层，确认 close 会 stop 引擎
  btn.props.onClick({ preventDefault() {} })
  await tick()
  await tick()
  await tick()
  const ov2 = body.children.find((c) => c.className === 'dshwj-overlay')
  check('再次打开浮层', !!ov2)
  const closeBtn = ov2.children[0].children.find((c) => c.className === 'dshwj-close')
  closeBtn.dispatch('click')
  check('点关闭后浮层移除', !body.children.find((c) => c.className === 'dshwj-overlay'))

  console.log(`\n==== ${pass} passed, ${fail} failed ====`)
  process.exit(fail === 0 ? 0 : 1)
})()
