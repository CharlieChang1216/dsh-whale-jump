/**
 * 语言跟随（i18n）回归测试。
 *
 * 验证：
 *   1. 浏览器兜底：<html lang> / navigator.languages 能正确归一化到 zh / en
 *   2. setActiveLocale 会真正切换文案，且只在不同语言时通知订阅者
 *   3. 未知 key 回退到 key 本身（不会渲染成 undefined）
 *   4. apply() 能接上 DSH 的 locale 服务，并在语言切换时实时跟随
 */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const SRC = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')

const noop = () => {}
const ctx2d = new Proxy({ createLinearGradient: () => ({ addColorStop: noop }) }, { get: (t, p) => (p in t ? t[p] : noop) })

function makeSandbox(lang) {
  let factory = null
  const sandbox = {
    window: {
      __ModuleLoader__: { load: (hd) => (factory = hd.factory) },
      devicePixelRatio: 1,
      addEventListener: noop,
      removeEventListener: noop,
    },
    document: {
      documentElement: { lang, appendChild: noop },
      head: { appendChild: noop },
      body: { appendChild: noop },
      createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d, addEventListener: noop, focus: noop }),
      querySelector: () => null,
      addEventListener: noop,
    },
    navigator: { language: lang, languages: [lang] },
    Image: class {
      constructor() {
        this.complete = false
        this.naturalWidth = 0
      }
    },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: noop,
    setInterval: () => 1,
    clearInterval: noop,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ best: 0 }) }),
    console,
    Math,
    Date,
    JSON,
    Proxy,
    Set,
    Map,
    Array,
    Object,
    String,
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(SRC, sandbox, { filename: 'client.js' })

  const mod = factory((spec) => {
    if (spec === 'react') return { useCallback: (f) => f, useState: (i) => [i, noop], useEffect: noop }
    if (spec === 'react/jsx-runtime') return { jsx: (t, p) => ({ type: t, props: p }) }
    throw new Error('unexpected require ' + spec)
  })
  return mod
}

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

console.log('\n[1] 语言标签归一化')
{
  const { normalizeLocale } = makeSandbox('zh-CN').__i18n
  const cases = [
    ['zh', 'zh'],
    ['zh-CN', 'zh'],
    ['zh-Hans', 'zh'],
    ['ZH-tw', 'zh'],
    ['en', 'en'],
    ['en-US', 'en'],
    ['EN-gb', 'en'],
    ['fr-FR', null],
    ['', null],
    [null, null],
    [undefined, null],
  ]
  let ok = true
  const bad = []
  for (const [input, expect] of cases) {
    const got = normalizeLocale(input)
    if (got !== expect) {
      ok = false
      bad.push(`${String(input)} → ${String(got)} (期望 ${String(expect)})`)
    }
  }
  check('各种 BCP-47 标签都归一化正确', ok, bad.join('; '))
}

console.log('\n[2] 浏览器兜底')
{
  const zhMod = makeSandbox('zh-CN').__i18n
  check('html lang=zh-CN → zh', zhMod.detectFromBrowser() === 'zh', zhMod.detectFromBrowser())

  const enMod = makeSandbox('en-US').__i18n
  check('html lang=en-US → en', enMod.detectFromBrowser() === 'en', enMod.detectFromBrowser())

  // 默认（zh）下的文案
  check('默认显示中文文案', zhMod.T.idle.indexOf('等太久') === 0, zhMod.T.idle)
}

console.log('\n[3] 切换语言')
{
  const mod = makeSandbox('zh-CN')
  const { T, setActiveLocale, currentLocale, subscribeLocale } = mod.__i18n

  check('初始是中文', T.idle.indexOf('等太久') === 0, T.idle)

  let notified = 0
  const off = subscribeLocale(() => notified++)

  setActiveLocale('en')
  check('切到 en 后文案变化', T.idle === 'Waiting too long? Play a round~', T.idle)
  check('切到 en 后 currentLocale 为 en', currentLocale() === 'en', currentLocale())
  check('触发了 1 次通知', notified === 1, String(notified))

  // 同一语言重复设置不应再通知
  setActiveLocale('en')
  check('重复设置同一语言不重复通知', notified === 1, String(notified))

  setActiveLocale('zh')
  check('切回 zh 文案恢复', T.idle.indexOf('等太久') === 0, T.idle)
  check('又触发 1 次通知', notified === 2, String(notified))

  // 所有 key 在两种语言下都有值
  const keys = ['idle', 'urgent', 'hero', 'start', 'restart', 'restartHint', 'score', 'best', 'close', 'hint', 'over', 'oxygen']
  let allZh = true
  let allEn = true
  setActiveLocale('zh')
  for (const k of keys) {
    if (typeof T[k] !== 'string' || !T[k]) allZh = false
    if (T[k] === k) allZh = false
  }
  setActiveLocale('en')
  for (const k of keys) {
    if (typeof T[k] !== 'string' || !T[k]) allEn = false
    if (T[k] === k) allEn = false
  }
  check('12 个 key 在 zh 下都有译文', allZh)
  check('12 个 key 在 en 下都有译文', allEn)

  // 中英确实不同（防止漏翻）
  const zhDict = mod.__i18n.DICT.zh
  const enDict = mod.__i18n.DICT.en
  const missing = keys.filter((k) => !zhDict[k] || !enDict[k])
  check('两个字典的 key 集合一致且齐全', missing.length === 0, missing.join(','))
  const same = keys.filter((k) => zhDict[k] === enDict[k])
  check('没有中英完全相同的条目（符号类除外）', same.every((k) => k === 'restartHint'), same.join(','))

  // 注意：上面的 key 校验过程中为了测英文又切了一次语言，所以通知数会变；
  // 这里记录取消订阅前的快照，只验证「取消之后不再增加」。
  const beforeOff = notified
  off()
  setActiveLocale('zh')
  check('取消订阅后不再收到通知', notified === beforeOff, `${notified} vs ${beforeOff}`)
}

console.log('\n[4] 未知 key 不回退成 undefined')
{
  const { T } = makeSandbox('zh-CN').__i18n
  check('未知 key 原样返回', T.noSuchKey === 'noSuchKey', String(T.noSuchKey))
}

console.log('\n[5] apply() 接上 locale 服务并实时跟随')
{
  const mod = makeSandbox('zh-CN')
  const { T } = mod.__i18n

  // 造一个和 DSH locale 服务同形状的对象
  const fake = {
    snap: { active: 'en' },
    subs: new Set(),
    getLocale() {
      return this.snap
    },
    subscribe(fn) {
      this.subs.add(fn)
      return () => this.subs.delete(fn)
    },
    switchTo(id) {
      this.snap = { active: id }
      for (const f of Array.from(this.subs)) f()
    },
  }

  const registrations = []
  const ctx = {
    effect(fn) {
      return fn()
    },
    inject(deps, cb) {
      if (deps.indexOf('locale') >= 0) cb({ locale: fake, effect(fn) { return fn() } })
    },
    slots: {
      inject(n, fn) {
        return fn()
      },
      register(opts, comp) {
        registrations.push({ opts, comp })
        return noop
      },
    },
  }

  mod.apply(ctx)
  check('插槽仍照常注册', registrations.length === 1 && registrations[0].opts.id === 'whale-jump')

  check('apply 后立即采用服务的语言（en）', T.idle === 'Waiting too long? Play a round~', T.idle)

  fake.switchTo('zh')
  check('服务切换语言后文案实时跟随（zh）', T.idle.indexOf('等太久') === 0, T.idle)

  fake.switchTo('en')
  check('再切回 en 也跟随', T.idle === 'Waiting too long? Play a round~', T.idle)

  // 语言服务缺席时不应抛错
  let threw = null
  try {
    const ctx2 = {
      effect(fn) { return fn() },
      // 故意不提供 inject / get
      slots: { inject: (n, fn) => fn(), register: () => noop },
    }
    makeSandbox('zh-CN').apply(ctx2)
  } catch (e) {
    threw = e
  }
  check('缺少 locale 服务时不抛错', threw === null, threw && threw.message)
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`)
process.exit(fail === 0 ? 0 : 1)
