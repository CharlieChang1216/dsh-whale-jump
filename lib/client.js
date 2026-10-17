/**
 * dsh-whale-jump —— 客户端侧（DSH client module）。
 *
 * 这个文件由 DSH 自己的客户端模块系统加载：`/plugins/dsh-whale-jump/client.js`。
 * 执行时只做一件事 —— 向 `window.__ModuleLoader__` 注册工厂；真正的副作用
 * （CSS 注入、插槽注册）都在 factory 里，等到被 import 时才跑。
 *
 * 为什么不用 index 注入：桌面端（Electron）的注入表只在宿主启动时收集一次并
 * 缓存，且页面侧对 `script-src` 行是「加载失败即 reject 整个 boot」。走官方
 * client module 通道，既不用改 index.html，也不会连坐宿主启动。
 */
window.__ModuleLoader__.load({
  id: 'dsh-whale-jump',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const jsxRuntime = require('react/jsx-runtime')
    const h = jsxRuntime.jsx

    // =========================================================================
    // 文案
    // =========================================================================
    const ZH = {
      idle: '等太久了？先玩个小游戏~',
      urgent: '还在跑…要不要来一局？',
      hero: '小鲸鱼跳',
      start: '开始',
      restart: '再来一局',
      restartHint: '空格 / 点击',
      score: '得分',
      best: '最高',
      close: '关闭',
      hint: '空格 / ↑ 跃出水面 · ↓ 下潜（有氧气限制）· 按住跳更高或潜更深 · Esc 退出',
      over: '被撞到了',
      oxygen: '氧气',
    }
    const EN = {
      idle: 'Waiting too long? Play a round~',
      urgent: 'Still running… take a break?',
      hero: 'Whale Jump',
      start: 'Play',
      restart: 'Play again',
      restartHint: 'Space / click',
      score: 'Score',
      best: 'Best',
      close: 'Close',
      hint: 'Space / ↑ to leap · ↓ to dive (oxygen limited) · hold for higher or deeper · Esc to exit',
      over: 'Ouch, hit something',
      oxygen: 'Oxygen',
    }
    function detectLang() {
      try {
        const l = (document.documentElement && document.documentElement.lang) || navigator.language || 'zh'
        return String(l).toLowerCase().startsWith('zh') ? ZH : EN
      } catch (err) {
        return ZH
      }
    }
    const T = detectLang()

    // =========================================================================
    // 样式
    // =========================================================================
    const CSS_ID = 'dsh-whale-jump/app.css'
    const css = `
.dshwj-row{display:flex;justify-content:center;padding:2px 0 4px}
.dshwj-btn{display:inline-flex;align-items:center;gap:7px;font:inherit;font-size:12px;
  line-height:18px;color:var(--dsw-alias-label-caption,#8b909a);background:transparent;
  border:none;border-radius:999px;padding:3px 11px;cursor:pointer;opacity:.68;
  transition:opacity .25s ease,color .25s ease,background .25s ease,transform .25s ease}
.dshwj-btn:hover{opacity:1;color:var(--dsw-alias-label-secondary,#5b6069);
  background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1))}
.dshwj-btn:active{transform:scale(.97)}
.dshwj-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}
.dshwj-btn[data-urgent="1"]{opacity:1;color:var(--dsw-alias-label-primary,#1d2129);
  background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1))}
.dshwj-whale{display:inline-block;font-size:14px;line-height:1;
  transform-origin:50% 70%;transition:transform .3s ease}
.dshwj-btn[data-urgent="1"] .dshwj-whale{animation:dshwj-bob 1.8s ease-in-out infinite}
@keyframes dshwj-bob{0%,to{transform:translateY(0) rotate(0)}
  40%{transform:translateY(-3px) rotate(-7deg)}70%{transform:translateY(-1px) rotate(4deg)}}
@media (prefers-reduced-motion:reduce){.dshwj-btn[data-urgent="1"] .dshwj-whale{animation:none}}

.dshwj-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;
  align-items:center;justify-content:center;padding:24px;
  background:rgba(6,26,44,.5);-webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px);
  animation:dshwj-fade .18s ease}
@keyframes dshwj-fade{from{opacity:0}to{opacity:1}}
.dshwj-panel{position:relative;border-radius:18px;overflow:hidden;background:#e9f6fc;
  box-shadow:0 26px 70px rgba(0,0,0,.42),0 0 0 1px rgba(255,255,255,.14);
  max-width:100%;max-height:100%;display:flex;flex-direction:column;animation:dshwj-pop .22s cubic-bezier(.2,.9,.3,1.2)}
@keyframes dshwj-pop{from{transform:scale(.94);opacity:0}to{transform:scale(1);opacity:1}}
.dshwj-canvas{display:block;touch-action:none;cursor:pointer;width:100%;height:auto}
.dshwj-close{position:absolute;top:10px;right:10px;width:28px;height:28px;border-radius:999px;
  border:none;cursor:pointer;background:rgba(8,32,52,.35);color:#fff;font-size:15px;line-height:1;
  display:inline-flex;align-items:center;justify-content:center;
  transition:background .15s ease}
.dshwj-close:hover{background:rgba(8,32,52,.6)}
.dshwj-close:focus-visible{outline:2px solid #fff;outline-offset:2px}
.dshwj-over{position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:10px;border:none;cursor:pointer;
  background:rgba(10,38,60,.45);color:#fff;font:inherit;padding:0;
  animation:dshwj-fade .18s ease}
.dshwj-over[hidden]{display:none}
.dshwj-over-score{font-size:34px;font-weight:600;line-height:1;letter-spacing:.02em}
.dshwj-over-msg{font-size:13px;opacity:.82}
.dshwj-over-btn{display:inline-flex;align-items:center;gap:8px;margin-top:6px;
  padding:8px 20px;border-radius:999px;border:none;cursor:pointer;
  background:#fff;color:#123c5c;font:inherit;font-size:14px;font-weight:600;
  box-shadow:0 4px 14px rgba(0,0,0,.22);transition:transform .15s ease,box-shadow .15s ease}
.dshwj-over-btn:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,.28)}
.dshwj-over-btn:active{transform:translateY(0) scale(.98)}
.dshwj-over-btn:focus-visible{outline:2px solid #fff;outline-offset:2px}
.dshwj-over-hint{font-size:11px;opacity:.62;margin-top:2px}
@media (prefers-reduced-motion:reduce){.dshwj-over{animation:none}}
`

    function injectCss() {
      try {
        if (typeof document === 'undefined') return
        if (document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_ID) + ']')) return
        const tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-whale-jump'
        tag.dataset.pluginCss = CSS_ID
        tag.textContent = css
        ;(document.head || document.documentElement).appendChild(tag)
      } catch (err) {}
    }

    // =========================================================================
    // 游戏引擎
    // =========================================================================
    /** 逻辑坐标系（CSS 像素）。HiDPI 由 canvas backing store 处理。 */
    const CFG = {
      W: 720,
      H: 268,
      WATER_Y: 202, // 水面高度
      FPS: 60,
      MSPF: 1000 / 60,

      SPEED: 5.4, // 初速（像素/帧@60fps）
      MAX_SPEED: 12.5,
      ACCEL: 0.0011,

      GRAVITY: 0.62, // 重力（像素/帧²）
      JUMP_V0: 10, // 起跳初速（向上为正），实际 = JUMP_V0 + speed/10
      DROP_V: 2.2, // 松手后残余上升速度上限 → 「短按小跳、长按大跳」的关键
      MIN_JUMP_HEIGHT: 46, // 升过这个高度才允许被截断（保证轻点也能越过低矮障碍）
      FAST_FALL: 2.6,

      // —— 下潜 ——
      DIVE_V: 3.6, // 下潜初速（按住后还会继续加速）
      DIVE_ACCEL: 0.55, // 按住时向下的加速度
      DIVE_MAX_V: 6.5, // 下潜速度上限
      DIVE_MAX: 52, // 最大下潜深度（水面以下，像素）
      DIVE_BUOYANCY: 0.55, // 松开后上浮的加速度

      START_X: 118, // 角色固定 x
      CLEAR_TIME: 1500, // ms，开局无敌人
      SCORE_COEF: 0.02,
      MAX_DT: 90, // 单帧上限，避免切标签页后瞬移

      CHAR_H: 104, // 角色绘制高度
      CHAR_H_DUCK: 74, // 下潜时压低的高度

      OPPOSITE_GAP_MULT: 1.7, // 相邻障碍要求相反动作时，间距再放大这么多
    }

    // —— 氧气速率 ——
    // 按「每帧」归一化（乘 f = dt/16.67），所以与刷新率无关。
    // 满氧可连续下潜 OXY_DIVE_SECONDS 秒；恢复用时是消耗用时的 OXY_RECOVER_RATIO 倍
    // （即消耗 1 秒 ⇒ 需要 2 秒回满，速度正好是消耗的一半）。
    const OXY_DIVE_SECONDS = 4
    const OXY_RECOVER_RATIO = 2
    CFG.OXY_DRAIN = 1 / (OXY_DIVE_SECONDS * CFG.FPS)
    CFG.OXY_RECOVER = CFG.OXY_DRAIN / OXY_RECOVER_RATIO
    CFG.OXY_REARM = 0.3 // 耗尽后必须回到这个比例才允许再次下潜（防贴脸连按）

    const rand = (a, b) => a + Math.random() * (b - a)
    const randInt = (a, b) => Math.floor(rand(a, b + 1))
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

    /** 开局前这么久之内，带 earlyBoost 的障碍权重会被放大。 */
    const EARLY_WINDOW = 25000

    /**
     * 障碍类型。全部自己画的，不引用任何第三方美术。
     *
     * layer 决定 y 轴位置；dodge 决定玩家该做什么（不同 dodge 连在一起时要留更大的间隔）。
     *   surface —— 露出水面：
     *     h=30/44/58 的珊瑚与漂浮木（h=24）→ 跳过去
     *     **spire（灯塔）**: h=128，**跳不过去**。最高速下跳跃峰值 107.7px，角色碰撞盒
     *     底沿停在 y=104，而灯塔顶在 y=74 —— 差 30px，无论怎么按都撞。
     *     唯一解法是从水下绕过（潜到 -45 以下，碰撞盒落到 209 以后）。
     *   air —— 悬在水面上方，跳起来才会撞 → 下潜躲
     *   deep —— 沉在水面下，下潜才会撞 → 留在水面
     *
     * 注：kind 仍然是 'spire'（历史标识符，测试和碰撞分支都在用），
     * 但玩家看到的是「灯塔」。改名要同时动 3 处引用，收益不大。
     */
    const OBSTACLES = [
      { kind: 'coral', layer: 'surface', dodge: 'jump', w: 26, h: 44, weight: 3 },
      { kind: 'coral', layer: 'surface', dodge: 'jump', w: 34, h: 58, weight: 2 },
      { kind: 'coral', layer: 'surface', dodge: 'jump', w: 22, h: 30, weight: 3 },
      { kind: 'drift', layer: 'surface', dodge: 'jump', w: 38, h: 24, weight: 2 },
      { kind: 'spire', layer: 'surface', dodge: 'dive', w: 34, h: 128, weight: 2, minSpeed: 6 },
      { kind: 'gull', layer: 'air', dodge: 'dive', w: 42, h: 26, weight: 2, minSpeed: 8 },
      // 水母：开局就出现，且初期权重放大（用户要求「游戏初期水母出现频率」更高）
      { kind: 'jelly', layer: 'deep', dodge: 'stay', w: 30, h: 34, weight: 2, minSpeed: 0, earlyBoost: 3 },
    ]

    /** 某障碍在当前时刻的实际权重（含开局加成）。 */
    function weightOf(o, elapsedMs) {
      let w = o.weight
      if (o.earlyBoost && elapsedMs < EARLY_WINDOW) w *= o.earlyBoost
      return w
    }

    function pickObstacle(speed, elapsedMs) {
      const t = elapsedMs || 0
      // 未到 minSpeed 的类型不参与抽取
      const pool = OBSTACLES.filter((o) => !o.minSpeed || speed >= o.minSpeed)
      const list = pool.length ? pool : [OBSTACLES[0]]
      const total = list.reduce((s, o) => s + weightOf(o, t), 0)
      let r = Math.random() * total
      for (const o of list) {
        r -= weightOf(o, t)
        if (r <= 0) return o
      }
      return list[0]
    }

    class WhaleJump {
      constructor(canvas, opts) {
        this.canvas = canvas
        this.ctx = canvas.getContext('2d')
        this.onScore = (opts && opts.onScore) || function () {}
        this.onBest = (opts && opts.onBest) || function () {}
        this.best = (opts && opts.best) || 0

        this.raf = 0
        this.running = false
        this.over = false
        this.last = 0
        this.acc = 0

        this.speed = CFG.SPEED
        this.distance = 0
        this.score = 0
        this.elapsed = 0

        this.obstacles = []
        this.nextGap = 0

        // 角色
        this.py = 0 // 离水面的高度（向上为正，下潜为负）
        this.vy = 0
        this.jumping = false
        this.held = false
        this.reachedMin = false
        this.fastFall = false
        this.diving = false
        this.diveVel = 0
        this.bobPhase = Math.random() * Math.PI * 2

        // 氧气：1 = 满，0 = 耗尽。耗尽是下潜的硬约束。
        this.oxygen = 1
        this.oxyLocked = false
        this.oxyUsed = false

        // 装饰
        this.clouds = []
        this.bubbles = []
        this.sparkles = []
        this.waves = []

        this.sprite = null
        this.loadSprite((opts && opts.heroUrl) || '/dsh-whale-jump/hero.png')

        this.resize()
        this.seedDecor()
      }

      loadSprite(url) {
        try {
          const img = new Image()
          img.decoding = 'async'
          img.onload = () => {
            this.sprite = img
            this.draw()
          }
          img.src = url
        } catch (err) {
          this.sprite = null
        }
      }

      resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        this.canvas.width = Math.round(CFG.W * dpr)
        this.canvas.height = Math.round(CFG.H * dpr)
        this.canvas.style.width = CFG.W + 'px'
        this.canvas.style.height = CFG.H + 'px'
        this.dpr = dpr
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        this.draw()
      }

      seedDecor() {
        this.clouds = []
        for (let i = 0; i < 5; i++) {
          this.clouds.push({
            x: rand(0, CFG.W),
            y: rand(18, 84),
            s: rand(0.6, 1.25),
            a: rand(0.35, 0.8),
          })
        }
        this.bubbles = []
        for (let i = 0; i < 16; i++) {
          this.bubbles.push({
            x: rand(0, CFG.W),
            y: rand(CFG.WATER_Y + 6, CFG.H),
            r: rand(1.4, 4.2),
            v: rand(0.18, 0.62),
            a: rand(0.16, 0.42),
          })
        }
        this.waves = []
        for (let i = 0; i < 3; i++) this.waves.push(rand(0, Math.PI * 2))
      }

      start() {
        if (this.running) return
        this.reset()
        this.running = true
        this.over = false
        this.last = 0
        this.loop = this.loop.bind(this)
        this.raf = requestAnimationFrame(this.loop)
      }

      /**
       * 重开一局。
       *
       * ⚠️ 不能直接调 start()：撞死后 running 仍是 true（循环还在跑，只是不推进逻辑），
       * start() 的 `if (this.running) return` 会把重开整个吞掉 —— 这就是
       * 「结束后按空格没反应」的根因。这里显式复位 running 再重启。
       */
      restart() {
        this.stop()
        this.running = false
        this.over = false
        this.start()
      }

      reset() {
        this.speed = CFG.SPEED
        this.distance = 0
        this.score = 0
        this.elapsed = 0
        this.obstacles = []
        this.py = 0
        this.vy = 0
        this.jumping = false
        this.held = false
        this.fastFall = false
        this.reachedMin = false
        this.diving = false
        this.diveVel = 0
        this.oxygen = 1
        this.oxyLocked = false
        this.oxyUsed = false
        this.nextGap = CFG.W * 0.6
      }

      stop() {
        this.running = false
        if (this.raf) cancelAnimationFrame(this.raf)
        this.raf = 0
      }

      // —— 输入 ——
      press() {
        this.held = true
        if (this.over) {
          this.restart()
          return
        }
        if (!this.running) {
          this.start()
          return
        }
        // 已在水下 → 上浮；在水面或空中 → 起跳
        if (this.py < 0) this.surface()
        else if (!this.jumping) this.jump()
      }

      release() {
        this.held = false
        this.endJump()
      }

      /** 松开下潜键后由浮力接管（这里只清状态位，实际加速在 update 里）。 */
      releaseDive() {
        this.diving = false
      }

      dive() {
        if (this.over) return
        if (this.jumping) {
          // 空中按下 → 急坠（保持原有手感）
          this.setFastFall()
          return
        }
        // 氧气不足 / 还在耗尽后的锁定恢复期 → 拒绝下潜
        if (this.oxyLocked || this.oxygen <= 0) return
        this.diving = true
        this.diveVel = CFG.DIVE_V
        try {
          this.playDiveSound && this.playDiveSound()
        } catch (err) {}
      }

      /** 从水下往上冲，回到水面。 */
      surface() {
        this.diving = false
        this.diveVel = CFG.DIVE_V * 0.9
      }

      /**
       * 一帧氧气结算。
       *
       * 规则：**在水面以上就恢复，进入水下就消耗**（只看深度，不看按键意图）。
       * 这样「松开 ↓ 之后还没浮出水面」的那段仍算消耗，符合直觉；恢复速度是消耗的一半。
       * 归零时强制上浮并进入锁定，直到回到 OXY_REARM 才允许再次下潜。
       */
      stepOxygen(f) {
        const submerged = this.py < 0
        if (submerged) {
          this.oxygen -= CFG.OXY_DRAIN * f
          if (this.oxygen <= 0) {
            this.oxygen = 0
            this.oxyLocked = true
            // 强制上浮：清掉下潜意图并给一个向上的速度
            this.diving = false
            this.diveVel = -Math.max(CFG.DIVE_V, Math.abs(this.diveVel))
            this.tryPlayGasp()
          }
        } else {
          this.oxygen = Math.min(1, this.oxygen + CFG.OXY_RECOVER * f)
          // 回到阈值以上解除锁定
          if (this.oxyLocked && this.oxygen >= CFG.OXY_REARM) this.oxyLocked = false
        }
      }

      tryPlayGasp() {
        try {
          this.tone(300, 0.18, 'sawtooth', 0.035, 150)
        } catch (err) {}
      }

      jump() {
        this.jumping = true
        this.reachedMin = false
        this.fastFall = false
        this.diving = false
        this.diveVel = 0
        // 速度越快跳得越高一点 —— 高速时仍能越过障碍（与恐龙同款的自平衡）
        this.vy = CFG.JUMP_V0 + this.speed / 10
        try {
          this.playBlip()
        } catch (err) {}
      }

      endJump() {
        // 已经过了最低高度，且还在快速上升 → 截断。这就是手感的核心。
        if (this.reachedMin && this.vy > CFG.DROP_V) this.vy = CFG.DROP_V
      }

      setFastFall() {
        if (this.jumping) {
          this.fastFall = true
          this.vy = -CFG.DROP_V
        }
      }

      // —— 主循环 ——
      loop(now) {
        if (!this.running) return
        if (!this.last) this.last = now
        let dt = now - this.last
        this.last = now
        if (dt > CFG.MAX_DT) dt = CFG.MAX_DT
        this.update(dt)
        this.draw()
        this.raf = requestAnimationFrame(this.loop)
      }

      /** 一帧角色物理：跳跃（py>0）、下潜（py<0）、浮力回位。 */
      stepMotion(f) {
        if (this.jumping) {
          const mult = this.fastFall ? CFG.FAST_FALL : 1
          this.py += this.vy * f * mult
          this.vy -= CFG.GRAVITY * f * (this.fastFall ? CFG.FAST_FALL * 0.5 : 1)
          if (this.py > CFG.MIN_JUMP_HEIGHT) this.reachedMin = true
          // 可变跳跃高度的核心：**不按住时每帧持续约束**，而不是只在松手瞬间截一次。
          // 只在松手时截断会漏掉「松手时还没升到 MIN_JUMP_HEIGHT」的情况
          // （轻点后 reachedMin 仍是 false，截断被跳过，结果轻点也跳到满高）。
          if (!this.held && this.reachedMin && this.vy > CFG.DROP_V) this.vy = CFG.DROP_V
          if (this.py <= 0) {
            this.py = 0
            this.vy = 0
            this.jumping = false
            this.fastFall = false
            this.splash()
          }
          return
        }

        // 下潜 / 上浮：py 取负值表示在水下多深（0 = 水面）
        const inWater = this.diving || this.py < 0
        if (!inWater) return

        if (this.diving) {
          // 按住：持续获得向下的推力，直到深度封顶。
          // ⚠️ 这里**不能**只靠初速 + 浮力衰减：初速衰减完后角色会自己浮回水面，
          // 下潜就等于没做（第一版踩过这个坑：按住 200 帧后 py 又回到 0）。
          this.diveVel = Math.min(this.diveVel + CFG.DIVE_ACCEL * f, CFG.DIVE_MAX_V)
        } else {
          // 松开：浮力把角色推回水面
          this.diveVel -= CFG.DIVE_BUOYANCY * f
        }

        this.py -= this.diveVel * f

        if (this.py >= 0) {
          // 回到水面
          this.py = 0
          this.diveVel = 0
          this.diving = false
        } else if (this.py < -CFG.DIVE_MAX) {
          // 触底：深度封顶，向下的速度归零（之后保持悬浮或开始上浮）
          this.py = -CFG.DIVE_MAX
          this.diveVel = Math.min(this.diveVel, 0)
        }
      }

      update(dt) {
        const f = dt / CFG.MSPF // 归一化到「帧」

        // 先结算氧气（可能在这一帧强制上浮），再解算运动
        if (!this.over) this.stepOxygen(f)
        this.stepMotion(f)

        if (this.over) return

        this.elapsed += dt
        this.distance += this.speed * f
        this.speed = Math.min(CFG.MAX_SPEED, this.speed + CFG.ACCEL * f)

        const next = Math.floor(this.distance * CFG.SCORE_COEF)
        if (next !== this.score) {
          this.score = next
          this.onScore(this.score)
        }

        // 障碍推进与生成
        for (const o of this.obstacles) o.x -= this.speed * f
        this.obstacles = this.obstacles.filter((o) => o.x + o.w > -40)

        if (this.elapsed > CFG.CLEAR_TIME) {
          const lastO = this.obstacles[this.obstacles.length - 1]
          if (!lastO) {
            if (this.elapsed > CFG.CLEAR_TIME + this.nextGap) this.spawn()
          } else if (lastO.x + lastO.w + lastO.gap < CFG.W) {
            this.spawn()
          }
        }

        // 碰撞
        const box = this.hitbox()
        for (const o of this.obstacles) {
          const ob = this.obstacleBox(o)
          if (
            box.x < ob.x + ob.w &&
            box.x + box.w > ob.x &&
            box.y < ob.y + ob.h &&
            box.y + box.h > ob.y
          ) {
            this.crash()
            return
          }
        }

        // 装饰
        for (const c of this.clouds) {
          c.x -= this.speed * 0.11 * f
          if (c.x < -120) {
            c.x = CFG.W + rand(20, 160)
            c.y = rand(16, 84)
            c.s = rand(0.6, 1.25)
          }
        }
        for (const b of this.bubbles) {
          b.y -= b.v * f
          b.x -= this.speed * 0.32 * f
          if (b.y < CFG.WATER_Y) {
            b.y = CFG.H + rand(0, 20)
            b.x = rand(0, CFG.W)
          }
          if (b.x < -10) b.x = CFG.W + rand(0, 40)
        }
        for (let i = this.sparkles.length - 1; i >= 0; i--) {
          const s = this.sparkles[i]
          s.x += s.vx * f
          s.y += s.vy * f
          s.vy += 0.14 * f
          s.life -= dt
          if (s.life <= 0) this.sparkles.splice(i, 1)
        }
      }

      spawn() {
        const t = pickObstacle(this.speed, this.elapsed)
        // 间距随速度放大 —— 高速时给同样的反应时间（公平性）
        let gap = Math.round(t.w * this.speed + 120 * 0.6)

        // 相邻两个障碍如果要求**相反**的动作（一个要跳、一个要潜），
        // 在高速下几乎来不及切换。给这类组合额外拉大间隔。
        const prev = this.obstacles[this.obstacles.length - 1]
        if (prev && prev.dodge && t.dodge && prev.dodge !== t.dodge) {
          gap = Math.round(gap * CFG.OPPOSITE_GAP_MULT)
        }

        this.obstacles.push({
          kind: t.kind,
          layer: t.layer,
          dodge: t.dodge,
          x: CFG.W + 20,
          w: t.w,
          h: t.h,
          gap: randInt(gap, Math.round(gap * 1.5)),
          phase: Math.random() * Math.PI * 2,
          // air：离水面的悬浮高度；deep：沉到水面下多深
          fly: t.layer === 'air' ? randInt(10, 26) : 0,
          depth: t.layer === 'deep' ? randInt(16, 34) : 0,
        })
      }

      /** 角色的碰撞盒：比绘制范围窄，贴边蹭过不算撞。py 为负（下潜）时自然落到水面下。 */
      hitbox() {
        const w = CFG.CHAR_H * (308 / 320) // 立绘长宽比
        const cx = CFG.START_X
        const bottom = CFG.WATER_Y + 10 - this.py
        const bw = w * 0.44
        // 下潜时身体压低一点，观感上更「钻」进水里
        const bh = (this.py < 0 ? CFG.CHAR_H_DUCK : CFG.CHAR_H) * 0.74
        return { x: cx - bw / 2, y: bottom - bh, w: bw, h: bh }
      }

      /** 障碍占用的矩形。air/deep 两层按各自的 y 轴偏移算。 */
      obstacleBox(o) {
        if (o.layer === 'air') {
          // 悬在水面上方。底边必须高于「站在水面时角色碰撞盒的顶端」（约 水位-67），
          // 否则站着不动也会撞。留 8px 余量，并且 fly 向上加而不是向下压。
          const bottom = CFG.WATER_Y - 75 - o.fly
          return { x: o.x + o.w * 0.14, y: bottom - o.h, w: o.w * 0.72, h: o.h }
        }
        if (o.layer === 'deep') {
          // 沉在水面下：水面以下一段，下潜会撞
          return { x: o.x + o.w * 0.18, y: CFG.WATER_Y + o.depth, w: o.w * 0.64, h: o.h }
        }
        // surface：站水面上
        return { x: o.x + o.w * 0.16, y: CFG.WATER_Y - o.h, w: o.w * 0.68, h: o.h }
      }

      splash() {
        const box = this.hitbox()
        for (let i = 0; i < 7; i++) {
          this.sparkles.push({
            x: CFG.START_X + rand(-14, 14),
            y: CFG.WATER_Y,
            vx: rand(-1.4, 1.4),
            vy: rand(-2.4, -0.9),
            r: rand(1.2, 3),
            life: rand(320, 620),
            max: 620,
          })
        }
      }

      crash() {
        this.over = true
        this.jumping = false
        this.py = 0
        const s = this.score
        if (s > this.best) {
          this.best = s
          this.onBest(s)
        }
        for (let i = 0; i < 12; i++) {
          this.sparkles.push({
            x: CFG.START_X + rand(-18, 18),
            y: CFG.WATER_Y - 20 + rand(-14, 10),
            vx: rand(-2.2, 2.2),
            vy: rand(-3.2, -0.6),
            r: rand(1.4, 3.4),
            life: rand(420, 760),
            max: 760,
          })
        }
        try {
          this.playThud()
        } catch (err) {}
      }

      // —— 音效（WebAudio 合成，不依赖任何音频文件）——
      audioCtx() {
        if (this._ac !== undefined) return this._ac
        try {
          const AC = window.AudioContext || window.webkitAudioContext
          this._ac = AC ? new AC() : null
        } catch (err) {
          this._ac = null
        }
        return this._ac
      }

      tone(freq, dur, type, gain, slideTo) {
        const ac = this.audioCtx()
        if (!ac) return
        try {
          if (ac.state === 'suspended') ac.resume()
          const t0 = ac.currentTime
          const osc = ac.createOscillator()
          const g = ac.createGain()
          osc.type = type || 'sine'
          osc.frequency.setValueAtTime(freq, t0)
          if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
          g.gain.setValueAtTime(0.0001, t0)
          g.gain.exponentialRampToValueAtTime(gain || 0.08, t0 + 0.012)
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
          osc.connect(g).connect(ac.destination)
          osc.start(t0)
          osc.stop(t0 + dur + 0.02)
        } catch (err) {}
      }

      playBlip() {
        this.tone(520, 0.12, 'sine', 0.07, 880)
      }
      playThud() {
        this.tone(180, 0.26, 'triangle', 0.1, 70)
      }
      /** 入水：短促的下行滑音。 */
      playDiveSound() {
        this.tone(420, 0.16, 'sine', 0.05, 190)
      }

      // —— 绘制 ——
      draw() {
        const c = this.ctx
        if (!c) return
        c.clearRect(0, 0, CFG.W, CFG.H)

        // 天空
        const sky = c.createLinearGradient(0, 0, 0, CFG.WATER_Y)
        sky.addColorStop(0, '#bfe4f7')
        sky.addColorStop(0.55, '#dff0fa')
        sky.addColorStop(1, '#f2fbff')
        c.fillStyle = sky
        c.fillRect(0, 0, CFG.W, CFG.WATER_Y + 1)

        // 云
        for (const cl of this.clouds) this.drawCloud(cl)

        // 远山
        this.drawHills()

        // 海面
        const sea = c.createLinearGradient(0, CFG.WATER_Y, 0, CFG.H)
        sea.addColorStop(0, '#8fd0ea')
        sea.addColorStop(0.35, '#5fb3d8')
        sea.addColorStop(1, '#2c7ba8')
        c.fillStyle = sea
        c.fillRect(0, CFG.WATER_Y, CFG.W, CFG.H - CFG.WATER_Y)

        // 气泡
        for (const b of this.bubbles) {
          c.beginPath()
          c.arc(b.x, b.y, b.r, 0, Math.PI * 2)
          c.fillStyle = 'rgba(255,255,255,' + b.a + ')'
          c.fill()
        }

        // 障碍
        for (const o of this.obstacles) this.drawObstacle(o)

        // 角色
        this.drawCharacter()

        // 水面波纹（画在角色之后，制造「半浸在水里」的遮挡感）
        this.drawWaves()

        // 水花
        for (const s of this.sparkles) {
          const a = clamp(s.life / s.max, 0, 1)
          c.beginPath()
          c.arc(s.x, s.y, s.r, 0, Math.PI * 2)
          c.fillStyle = 'rgba(255,255,255,' + (a * 0.85).toFixed(3) + ')'
          c.fill()
        }

        // 分数
        this.drawHud()
      }

      drawCloud(cl) {
        const c = this.ctx
        c.save()
        c.globalAlpha = cl.a
        c.fillStyle = '#ffffff'
        const s = cl.s
        c.beginPath()
        c.ellipse(cl.x, cl.y, 34 * s, 15 * s, 0, 0, Math.PI * 2)
        c.ellipse(cl.x - 22 * s, cl.y + 4 * s, 20 * s, 11 * s, 0, 0, Math.PI * 2)
        c.ellipse(cl.x + 24 * s, cl.y + 3 * s, 22 * s, 12 * s, 0, 0, Math.PI * 2)
        c.fill()
        c.restore()
      }

      drawHills() {
        const c = this.ctx
        const off = (this.distance * 0.18) % 420
        c.save()
        c.fillStyle = 'rgba(150,206,228,.55)'
        for (let i = -1; i < 3; i++) {
          const bx = i * 420 - off
          c.beginPath()
          c.moveTo(bx, CFG.WATER_Y)
          c.quadraticCurveTo(bx + 110, CFG.WATER_Y - 74, bx + 220, CFG.WATER_Y)
          c.quadraticCurveTo(bx + 300, CFG.WATER_Y - 44, bx + 420, CFG.WATER_Y)
          c.closePath()
          c.fill()
        }
        c.restore()
      }

      drawWaves() {
        const c = this.ctx
        const t = this.elapsed / 520
        c.save()
        c.strokeStyle = 'rgba(255,255,255,.62)'
        c.lineWidth = 1.6
        for (let k = 0; k < 3; k++) {
          const y = CFG.WATER_Y + 3 + k * 5
          const amp = 1.8 - k * 0.45
          c.beginPath()
          for (let x = 0; x <= CFG.W; x += 12) {
            const yy = y + Math.sin((x + this.distance * (0.5 + k * 0.2)) * 0.028 + this.waves[k] + t) * amp
            if (x === 0) c.moveTo(x, yy)
            else c.lineTo(x, yy)
          }
          c.globalAlpha = 0.5 - k * 0.12
          c.stroke()
        }
        c.restore()
      }

      drawObstacle(o) {
        const c = this.ctx
        const baseY = CFG.WATER_Y + 2
        const x = o.x
        const sway = Math.sin(this.elapsed / 460 + o.phase) * 1.6

        c.save()
        if (o.kind === 'drift') {
          // 漂浮木
          c.fillStyle = '#8b6b4a'
          c.beginPath()
          c.roundRect(x, baseY - o.h + 4, o.w, o.h - 4, 8)
          c.fill()
          c.fillStyle = '#a8835c'
          c.beginPath()
          c.roundRect(x + 3, baseY - o.h + 6, o.w - 6, 7, 4)
          c.fill()
          c.strokeStyle = 'rgba(70,48,30,.45)'
          c.lineWidth = 1.4
          c.beginPath()
          c.moveTo(x + 9, baseY - o.h + 16)
          c.lineTo(x + o.w - 11, baseY - o.h + 16)
          c.stroke()
        } else if (o.kind === 'gull') {
          // 海鸥：悬在水面上方，跳跃时才会撞到。翅膀按正弦扇动。
          const cx = x + o.w / 2
          // 与 obstacleBox 的 air 分支保持同一基准（底边 = 水位 - 75 - fly）
          const cy = CFG.WATER_Y - 75 - o.fly - o.h
          const flap = Math.sin(this.elapsed / 150 + o.phase)
          c.fillStyle = '#f4f8fb'
          c.beginPath()
          c.ellipse(cx, cy + o.h * 0.45, o.w * 0.26, o.h * 0.34, 0, 0, Math.PI * 2)
          c.fill()
          // 双翅
          c.fillStyle = '#e3edf5'
          for (const dir of [-1, 1]) {
            c.beginPath()
            c.moveTo(cx, cy + o.h * 0.4)
            c.quadraticCurveTo(
              cx + dir * o.w * 0.5,
              cy + o.h * 0.1 + flap * o.h * 0.5,
              cx + dir * o.w * 0.62,
              cy + o.h * 0.45 + flap * o.h * 0.3,
            )
            c.quadraticCurveTo(cx + dir * o.w * 0.34, cy + o.h * 0.5, cx, cy + o.h * 0.56)
            c.closePath()
            c.fill()
          }
          // 喙 + 眼
          c.fillStyle = '#f2a13c'
          c.beginPath()
          c.moveTo(cx - o.w * 0.08, cy + o.h * 0.42)
          c.lineTo(cx - o.w * 0.26, cy + o.h * 0.5)
          c.lineTo(cx - o.w * 0.08, cy + o.h * 0.56)
          c.closePath()
          c.fill()
          c.fillStyle = '#2b3d4f'
          c.beginPath()
          c.arc(cx - o.w * 0.02, cy + o.h * 0.38, 1.5, 0, Math.PI * 2)
          c.fill()
        } else if (o.kind === 'spire') {
          // 灯塔：高到跳不过去，只能从水下绕过。
          // 由礁石基座 + 红白横纹塔身 + 灯室 + 扫动的光束组成。
          const cx = x + o.w / 2
          const top = baseY - o.h
          const bodyTop = top + o.h * 0.17 // 塔身顶端（灯室下沿）
          const w0 = o.w * 0.52 // 塔底宽
          const w1 = o.w * 0.32 // 塔顶宽（上窄下宽）

          // —— 礁石基座 ——
          c.fillStyle = '#6b7787'
          c.beginPath()
          c.ellipse(cx, baseY - 1, o.w * 0.62, o.h * 0.045 + 5, 0, 0, Math.PI * 2)
          c.fill()

          // —— 塔身 ——
          const bodyPath = () => {
            c.beginPath()
            c.moveTo(cx - w0, baseY)
            c.lineTo(cx - w1, bodyTop)
            c.lineTo(cx + w1, bodyTop)
            c.lineTo(cx + w0, baseY)
            c.closePath()
          }
          bodyPath()
          c.fillStyle = '#f2f4f7'
          c.fill()

          // 红白横纹：用裁剪把条纹限制在塔身内
          c.save()
          bodyPath()
          c.clip()
          const bands = 4
          c.fillStyle = '#d9483f'
          for (let i = 0; i < bands; i++) {
            const segH = (baseY - bodyTop) / bands
            const y0 = bodyTop + segH * i
            // 隔一条画一条
            if (i % 2 === 0) c.fillRect(cx - o.w, y0, o.w * 2, segH * 0.62)
          }
          // 受光面：不用渐变（纯色叠加更稳，也让预览渲染器能还原）
          c.fillStyle = 'rgba(20,36,54,.16)'
          c.fillRect(cx - o.w, bodyTop, o.w * 0.62, baseY - bodyTop)
          c.fillStyle = 'rgba(255,255,255,.10)'
          c.fillRect(cx + o.w * 0.2, bodyTop, o.w * 0.42, baseY - bodyTop)
          c.restore()

          // 塔身轮廓
          bodyPath()
          c.strokeStyle = 'rgba(48,62,80,.55)'
          c.lineWidth = 1.4
          c.stroke()

          // —— 灯室 ——
          const lampW = o.w * 0.44
          const lampH = o.h * 0.1
          const lampY = bodyTop - lampH
          c.fillStyle = '#3f4c5e'
          c.beginPath()
          c.roundRect(cx - lampW / 2, lampY, lampW, lampH, 2)
          c.fill()
          // 玻璃窗（暖黄）
          c.fillStyle = '#ffd67a'
          c.beginPath()
          c.roundRect(cx - lampW / 2 + 2, lampY + 1.5, lampW - 4, lampH - 3, 1.5)
          c.fill()

          // 顶盖 + 尖顶
          c.fillStyle = '#d9483f'
          c.beginPath()
          c.moveTo(cx - lampW * 0.72, lampY)
          c.lineTo(cx, lampY - o.h * 0.055)
          c.lineTo(cx + lampW * 0.72, lampY)
          c.closePath()
          c.fill()
          c.strokeStyle = 'rgba(48,62,80,.5)'
          c.lineWidth = 1
          c.beginPath()
          c.moveTo(cx, lampY - o.h * 0.055)
          c.lineTo(cx, top)
          c.stroke()

          // 扫动的光束（缓慢旋转，纯装饰，不参与碰撞）
          const beam = Math.sin(this.elapsed / 900 + o.phase) * 0.5 + 0.5
          c.save()
          c.globalAlpha = 0.16 + beam * 0.16
          c.fillStyle = '#ffe9a8'
          c.beginPath()
          c.moveTo(cx, lampY + lampH / 2)
          c.lineTo(cx + o.w * (1.1 + beam * 1.4), lampY - o.h * 0.02)
          c.lineTo(cx + o.w * (1.1 + beam * 1.4), lampY + lampH * 1.5)
          c.closePath()
          c.fill()
          c.restore()

          // —— 水线处的浪花 ——
          c.fillStyle = 'rgba(255,255,255,.55)'
          c.beginPath()
          c.ellipse(cx, baseY - 2, o.w * 0.7, 4.5, 0, 0, Math.PI * 2)
          c.fill()
        } else if (o.kind === 'jelly') {
          // 水母：沉在水面下，只有下潜才会撞到。伞盖 + 触手摆动。
          const cx = x + o.w / 2
          const cy = CFG.WATER_Y + o.depth
          const pulse = 1 + Math.sin(this.elapsed / 420 + o.phase) * 0.08
          c.fillStyle = 'rgba(200,150,235,.82)'
          c.beginPath()
          c.ellipse(cx, cy + o.h * 0.32, (o.w * 0.5) * pulse, (o.h * 0.34) * pulse, 0, Math.PI, 0)
          c.closePath()
          c.fill()
          // 触手
          c.strokeStyle = 'rgba(190,140,230,.72)'
          c.lineWidth = 2
          for (let i = -1; i <= 1; i++) {
            const tx = cx + i * o.w * 0.22
            c.beginPath()
            c.moveTo(tx, cy + o.h * 0.32)
            c.quadraticCurveTo(
              tx + Math.sin(this.elapsed / 300 + i + o.phase) * 4,
              cy + o.h * 0.62,
              tx + Math.sin(this.elapsed / 260 + i * 2 + o.phase) * 3,
              cy + o.h * 0.86,
            )
            c.stroke()
          }
          // 高光
          c.fillStyle = 'rgba(255,255,255,.5)'
          c.beginPath()
          c.ellipse(cx - o.w * 0.14, cy + o.h * 0.2, o.w * 0.1, o.h * 0.07, -0.5, 0, Math.PI * 2)
          c.fill()
        } else {
          // 珊瑚：主干 + 分枝，自己画的
          const cx = x + o.w / 2
          const top = baseY - o.h
          c.strokeStyle = '#e2725b'
          c.lineCap = 'round'
          c.lineWidth = Math.max(4, o.w * 0.26)
          c.beginPath()
          c.moveTo(cx, baseY)
          c.quadraticCurveTo(cx + sway, (baseY + top) / 2, cx + sway * 1.6, top + o.h * 0.16)
          c.stroke()

          c.lineWidth = Math.max(3, o.w * 0.17)
          c.strokeStyle = '#ee8f74'
          c.beginPath()
          c.moveTo(cx + sway * 0.4, baseY - o.h * 0.38)
          c.quadraticCurveTo(cx - o.w * 0.52, baseY - o.h * 0.5, cx - o.w * 0.6, top + o.h * 0.24)
          c.stroke()
          c.beginPath()
          c.moveTo(cx + sway * 0.7, baseY - o.h * 0.54)
          c.quadraticCurveTo(cx + o.w * 0.58, baseY - o.h * 0.62, cx + o.w * 0.66, top + o.h * 0.34)
          c.stroke()

          // 顶端小球
          c.fillStyle = '#f6a98f'
          c.beginPath()
          c.arc(cx + sway * 1.6, top + o.h * 0.14, Math.max(2.6, o.w * 0.14), 0, Math.PI * 2)
          c.fill()
        }
        c.restore()
      }

      drawCharacter() {
        const c = this.ctx
        const underwater = this.py < 0
        const bob = this.jumping || underwater ? 0 : Math.sin(this.elapsed / 620 + this.bobPhase) * 3.2
        const bottom = CFG.WATER_Y + 10 - this.py + bob
        const w = CFG.CHAR_H * (308 / 320)
        // 下潜时整体略缩小，读作「退到水里去了」
        const hh = underwater ? CFG.CHAR_H_DUCK : CFG.CHAR_H
        const x = CFG.START_X - w / 2
        const y = bottom - hh

        // 挤压拉伸：起跳拉长、下落压扁、入水压扁
        let sx = 1
        let sy = 1
        let rot = 0
        if (this.jumping) {
          const t = clamp(this.vy / 11, -1, 1)
          sy = 1 + t * 0.075
          sx = 1 - t * 0.055
          rot = -t * 0.05
        } else if (underwater) {
          // 下潜：顺着下潜速度轻微前倾
          const t = clamp(this.diveVel / 8, -1, 1)
          rot = t * 0.12
          sy = 1 - Math.abs(t) * 0.03
        } else {
          sy = 1 + Math.sin(this.elapsed / 620 + this.bobPhase) * 0.012
          sx = 1 - Math.sin(this.elapsed / 620 + this.bobPhase) * 0.008
        }
        if (this.over) {
          rot = 0.16
          sy = 0.94
        }

        c.save()
        // 水下时整体压暗 + 偏蓝，读作「在水里」
        if (underwater) {
          const depth = clamp(-this.py / CFG.DIVE_MAX, 0, 1)
          c.globalAlpha = 1 - depth * 0.28
        }
        c.translate(x + w / 2, y + hh)
        c.rotate(rot)
        c.scale(sx, sy)
        if (this.sprite && this.sprite.complete && this.sprite.naturalWidth) {
          c.drawImage(this.sprite, -w / 2, -hh, w, hh)
        } else {
          // 立绘缺失时的兜底：画一只代码鲸鱼，保证任何情况下画面里都有主角。
          this.drawFallbackWhale(w, hh)
        }
        c.restore()
      }

      /** 代码绘制的兜底鲸鱼（立绘加载失败 / 尚未就绪时使用）。 */
      drawFallbackWhale(w, hh) {
        const c = this.ctx
        const bw = w * 0.62
        const bh = hh * 0.52
        const cy = -hh * 0.46

        c.fillStyle = '#3f6fa8'
        c.beginPath()
        c.ellipse(0, cy, bw / 2, bh / 2, 0, 0, Math.PI * 2)
        c.fill()

        // 腹部浅色
        c.fillStyle = '#cfe4f4'
        c.beginPath()
        c.ellipse(0, cy + bh * 0.16, bw * 0.42, bh * 0.3, 0, 0, Math.PI * 2)
        c.fill()

        // 尾鳍
        c.fillStyle = '#35608f'
        c.beginPath()
        c.moveTo(bw * 0.46, cy)
        c.quadraticCurveTo(bw * 0.78, cy - bh * 0.5, bw * 0.9, cy - bh * 0.12)
        c.quadraticCurveTo(bw * 0.72, cy + bh * 0.06, bw * 0.46, cy + bh * 0.16)
        c.closePath()
        c.fill()

        // 眼睛
        c.fillStyle = '#12314c'
        c.beginPath()
        c.arc(bw * 0.26, cy - bh * 0.1, Math.max(1.8, bw * 0.045), 0, Math.PI * 2)
        c.fill()

        // 喷水
        c.strokeStyle = 'rgba(255,255,255,.75)'
        c.lineWidth = 2
        c.beginPath()
        c.moveTo(bw * 0.06, cy - bh * 0.46)
        c.quadraticCurveTo(bw * 0.02, cy - bh * 0.86, bw * 0.16, cy - bh * 0.98)
        c.stroke()
      }

      drawHud() {
        const c = this.ctx
        c.save()
        c.font = '600 15px ui-monospace, SFMono-Regular, Menlo, monospace'
        c.textBaseline = 'top'
        c.fillStyle = 'rgba(24,58,84,.72)'
        c.textAlign = 'right'
        c.fillText(String(this.score).padStart(5, '0'), CFG.W - 18, 16)
        c.font = '500 11px ui-sans-serif, system-ui, sans-serif'
        c.fillStyle = 'rgba(24,58,84,.42)'
        c.fillText(T.best + ' ' + String(this.best).padStart(5, '0'), CFG.W - 18, 36)
        c.restore()

        this.drawOxygen()
      }

      /**
       * 氧气条：左上角。
       * 满氧时很淡（不抢戏），一旦消耗就变实；
       * 低氧转橙、见底转红并轻微脉动，耗尽锁定时整条闪红。
       */
      drawOxygen() {
        const c = this.ctx
        const o = clamp(this.oxygen, 0, 1)
        const x = 18
        const y = 18
        const w = 150
        const h = 9
        const r = h / 2

        // 满氧且未锁定 → 淡出，只留一点痕迹
        const idle = o >= 1 && !this.oxyLocked
        const alpha = idle ? 0.28 : 1

        c.save()
        c.globalAlpha = alpha

        // 标签（中文"氧气"比英文宽，预留 26px）
        c.font = '600 10px ui-sans-serif, system-ui, sans-serif'
        c.textBaseline = 'middle'
        c.textAlign = 'left'
        c.fillStyle = 'rgba(24,58,84,.55)'
        c.fillText(T.oxygen, x, y + h / 2)

        // 轨道
        const bx = x + 26
        const bw = w - 26
        c.fillStyle = 'rgba(24,58,84,.16)'
        c.beginPath()
        c.roundRect(bx, y, bw, h, r)
        c.fill()

        // 填充
        let fill = '#39b7d8'
        if (o <= 0.25) fill = '#e0574a'
        else if (o <= 0.5) fill = '#e8a33d'

        // 低氧或锁定时脉动，给玩家一个视觉警告
        let pulse = 0
        if (this.oxyLocked || o <= 0.25) {
          pulse = 0.5 + 0.5 * Math.sin(this.elapsed / 110)
        }

        const fw = Math.max(0, bw * o)
        if (fw > 0) {
          c.fillStyle = fill
          if (pulse) c.globalAlpha = alpha * (0.55 + 0.45 * pulse)
          c.beginPath()
          c.roundRect(bx, y, fw, h, Math.min(r, fw / 2))
          c.fill()
          c.globalAlpha = alpha
        }

        // 锁定提示：条外描一圈红
        if (this.oxyLocked) {
          c.globalAlpha = alpha * (0.35 + 0.5 * pulse)
          c.strokeStyle = '#e0574a'
          c.lineWidth = 1.5
          c.beginPath()
          c.roundRect(bx - 1.5, y - 1.5, bw + 3, h + 3, r + 1.5)
          c.stroke()
        }

        c.restore()
      }

      // —— 结算界面 ——
      drawGameOver() {
        const c = this.ctx
        c.save()
        c.fillStyle = 'rgba(10,38,60,.42)'
        c.fillRect(0, 0, CFG.W, CFG.H)
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillStyle = '#fff'
        c.font = '600 26px ui-sans-serif, system-ui, sans-serif'
        c.fillText(String(this.score), CFG.W / 2, CFG.H / 2 - 22)
        c.font = '500 13px ui-sans-serif, system-ui, sans-serif'
        c.globalAlpha = 0.8
        c.fillText(T.over, CFG.W / 2, CFG.H / 2 + 8)
        c.globalAlpha = 1
        c.restore()
      }
    }

    // =========================================================================
    // 浮层（纯 DOM，不依赖 react-dom）
    // =========================================================================
    let overlayEl = null
    let game = null

    function fetchBest() {
      return fetch('/dsh-whale-jump/state', { headers: { accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d && typeof d.best === 'number' ? d.best : 0))
        .catch(() => 0)
    }

    function reportScore(score) {
      try {
        fetch('/dsh-whale-jump/state', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ score }),
        }).catch(() => {})
      } catch (err) {}
    }

    function closeOverlay() {
      if (!overlayEl) return
      try {
        if (game) game.stop()
        game = null
        overlayEl.remove()
      } catch (err) {}
      overlayEl = null
      overEl = null
      overScoreEl = null
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }

    function onKeyDown(e) {
      if (!overlayEl) return
      if (e.key === 'Escape') {
        e.preventDefault()
        closeOverlay()
        return
      }
      // 跳跃键：结束时 = 重开；进行中 = 跃出水面
      if (e.key === ' ' || e.key === 'ArrowUp' || e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        if (e.repeat || !game) return
        if (game.over) restartGame()
        else game.press()
        return
      }
      // 下潜键：空中 = 急坠；水面 = 下潜（按住潜更深）
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault()
        e.stopPropagation()
        if (e.repeat || !game) return
        if (game.over) {
          restartGame()
          return
        }
        game.dive()
        return
      }
    }

    function onKeyUp(e) {
      if (!overlayEl) return
      if (e.key === ' ' || e.key === 'ArrowUp' || e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        if (game) game.release()
        return
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault()
        e.stopPropagation()
        if (game) game.releaseDive()
      }
    }

    /** 结算浮层的 DOM 引用（重开时隐藏/显示，不用重建）。 */
    let overEl = null
    let overScoreEl = null

    function showGameOver() {
      if (!overEl) return
      try {
        if (overScoreEl) overScoreEl.textContent = String(game ? game.score : 0)
        overEl.hidden = false
        const btn = overEl.querySelector && overEl.querySelector('.dshwj-over-btn')
        if (btn && btn.focus) btn.focus()
      } catch (err) {}
    }

    function hideGameOver() {
      try {
        if (overEl) overEl.hidden = true
      } catch (err) {}
    }

    /** 统一的「重开一局」入口：按钮、空格、点击 canvas 都走这里。 */
    function restartGame() {
      if (!game) return
      hideGameOver()
      game.restart()
    }

    function openOverlay() {
      if (overlayEl) return
      try {
        const overlay = document.createElement('div')
        overlay.className = 'dshwj-overlay'
        overlay.setAttribute('role', 'dialog')
        overlay.setAttribute('aria-modal', 'true')
        overlay.setAttribute('aria-label', T.hero)

        const panel = document.createElement('div')
        panel.className = 'dshwj-panel'

        const canvas = document.createElement('canvas')
        canvas.className = 'dshwj-canvas'
        canvas.setAttribute('aria-label', T.hint)
        panel.appendChild(canvas)

        // —— 结算层：真正的 DOM 按钮，比 canvas 里画的字好点得多 ——
        const over = document.createElement('div')
        over.className = 'dshwj-over'
        over.hidden = true

        const overScore = document.createElement('div')
        overScore.className = 'dshwj-over-score'
        overScore.textContent = '0'
        over.appendChild(overScore)

        const overMsg = document.createElement('div')
        overMsg.className = 'dshwj-over-msg'
        overMsg.textContent = T.over
        over.appendChild(overMsg)

        const overBtn = document.createElement('button')
        overBtn.className = 'dshwj-over-btn'
        overBtn.type = 'button'
        overBtn.textContent = T.restart
        overBtn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          restartGame()
        })
        over.appendChild(overBtn)

        const overHint = document.createElement('div')
        overHint.className = 'dshwj-over-hint'
        overHint.textContent = T.restartHint
        over.appendChild(overHint)

        // 点结算层的空白处也算重开（整层是热区）
        over.addEventListener('pointerdown', (e) => {
          if (e.target === over || e.target === overScore || e.target === overMsg || e.target === overHint) {
            e.preventDefault()
            restartGame()
          }
        })

        panel.appendChild(over)
        overEl = over
        overScoreEl = overScore

        const close = document.createElement('button')
        close.className = 'dshwj-close'
        close.type = 'button'
        close.setAttribute('aria-label', T.close)
        close.textContent = '✕'
        close.addEventListener('click', closeOverlay)
        panel.appendChild(close)

        overlay.appendChild(panel)
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) closeOverlay()
        })
        document.body.appendChild(overlay)
        overlayEl = overlay

        fetchBest().then((best) => {
          if (!overlayEl) return
          game = new WhaleJump(canvas, {
            best,
            onScore: function () {},
            onBest: function (s) {},
          })
          game.start()

          // 撞死时：画一层暗色、弹结算按钮、上报分数
          const origCrash = game.crash.bind(game)
          game.crash = function () {
            origCrash()
            game.drawGameOver()
            reportScore(game.score)
            showGameOver()
          }

          canvas.addEventListener('pointerdown', (e) => {
            e.preventDefault()
            if (!game) return
            if (game.over) {
              restartGame()
              return
            }
            game.press()
          })
          canvas.addEventListener('pointerup', () => {
            if (game) {
              game.release()
              game.releaseDive()
            }
          })
          canvas.focus && canvas.focus()
        })

        window.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('keyup', onKeyUp, true)
      } catch (err) {
        closeOverlay()
      }
    }

    // =========================================================================
    // 入口行（React 组件，注册进 conversation.input.dock）
    // =========================================================================
    /**
     * 等待越久越显眼：会话处于 running 状态超过 20 秒后，把这一行提亮。
     * 这里只用 props.session.running —— 它由插槽 owner 每帧传进来，
     * 组件自己不订阅任何 store。
     */
    function useWaitedLong(running) {
      const React2 = React
      const [waited, setWaited] = React2.useState(0)
      React2.useEffect(() => {
        if (!running) {
          setWaited(0)
          return undefined
        }
        const started = Date.now()
        const timer = setInterval(() => setWaited(Date.now() - started), 1000)
        return () => clearInterval(timer)
      }, [running])
      return waited >= 20000
    }

    function JumpRow(props) {
      const session = props && props.session
      const running = !!(session && session.running)
      const blank = !!(session && session.blank)
      const urgent = useWaitedLong(running)
      const label = blank ? T.hero : urgent ? T.urgent : T.idle

      const onClick = React.useCallback(() => {
        openOverlay()
      }, [])

      // 注意：React 自动运行时的 jsx(type, props, key) 第三个参数是 key，
      // 不是 children —— children 必须放进 props，否则整行渲染成空。
      return h('div', {
        className: 'dshwj-row',
        children: h('button', {
          type: 'button',
          className: 'dshwj-btn',
          'data-urgent': urgent ? '1' : '0',
          onClick,
          title: T.hint,
          children: [
            h('span', { key: 'i', className: 'dshwj-whale', 'aria-hidden': 'true', children: '🐳' }),
            h('span', { key: 'l', children: label }),
          ],
        }),
      })
    }

    // =========================================================================
    // 插件入口
    // =========================================================================
    const inject = ['slots']

    function apply(ctx) {
      injectCss()
      ctx.effect(
        () =>
          ctx.slots.inject('conversation.input.dock', () =>
            ctx.slots.register(
              {
                name: 'conversation.input.dock',
                id: 'whale-jump',
                order: 30,
              },
              JumpRow,
            ),
          ),
        'dsh-whale-jump: input dock entry',
      )
    }

    exports.JumpRow = JumpRow
    exports.apply = apply
    exports.inject = inject
    // 测试句柄：_study/test-client.cjs 用它直接驱动引擎验证物理，
    // 运行时不消费（浏览器里没人读这个字段）。
    exports.__engine = { WhaleJump, CFG, OBSTACLES }
    return module.exports
  },
})
