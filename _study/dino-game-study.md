# 恐龙游戏（dinosaur.game）原理 + DSH 插件机制 学习笔记

> 目标：为后续开发「DSH 插件版类 Chrome 小恐龙跑酷小游戏」打底。
> 本文件只记录**已实测/已读源码**的事实，推断处显式标注「推断」。
> 采集时间：2026-10-17。参考站点：<https://dinosaur.game/zh/dinosaur-game>

---

## 一、结论速览

1. **这个网站不是自研引擎，它就是 Chrome 的 `offline.js`（T-Rex Runner）原版代码**，被 webpack 拆包后放在 `/assets/js/809.js`（chunk id 809，「dinorunner」）。所有物理常量、精灵图、碰撞盒、计分规则都能逐行对上 Chromium 的 `components/neterror/resources/offline.js`。
2. 游戏本体 = **一个 600×150 的 canvas + requestAnimationFrame 循环 + 手写 AABB 碰撞**，没有物理库、没有游戏引擎、没有外部图片/音频文件（精灵图和音效都以 base64 内联在 index.html 里）。
3. DSH 侧：本项目要做的插件属于**标准 DSH bundle 插件**（`package.json` 的 `dsh.bundle.patch` + `cordis.patch.yml`），宿主侧用 `ctx.webServer` 注册路由 / 注入 index，前端用一个独立 JS 挂到 DOM 上。当前环境是**官方桌面端（Electron，`desktop` profile）**，注入走 `webserver/index-inject` 结构化行。

---

## 二、恐龙游戏的运行原理

### 2.1 装载链路

```
index.html
  ├─ <div id="offline-resources">
  │    ├─ <img id="offline-resources-1x" src="data:image/png;base64,...">   ← 262×N 精灵图（LDPI）
  │    ├─ <img id="offline-resources-2x" src="data:image/png;base64,...">   ← HDPI 精灵图（devicePixelRatio>1 时用）
  │    └─ <template id="audio-resources">
  │         ├─ <audio id="offline-sound-press">   跳跃
  │         ├─ <audio id="offline-sound-hit">     撞击
  │         └─ <audio id="offline-sound-reached"> 每 100 分
  └─ <script defer src="/assets/js/809.js">   ← 游戏本体（webpack chunk 809）
```

`809.js` 末尾：

```js
document.addEventListener("DOMContentLoaded", function () {
  new Runner(".interstitial-wrapper");   // 单例：if (Runner.instance_) return Runner.instance_
});
```

**要点**：精灵图与音效全部内联，因此页面**零外部资源依赖**、可离线；这也是能被轻易复刻的原因。

### 2.2 尺寸与时序

| 项 | 值 | 说明 |
|---|---|---|
| canvas 逻辑尺寸 | 600 × 150 | `Runner.defaultDimensions` |
| `msPerFrame` | 1000/60 ≈ 16.67ms | 所有速度换算的分母 |
| 帧循环 | `requestAnimationFrame` | `scheduleNextUpdate()` 自递归，`updatePending` 做去重 |
| 帧间隔 `delta` | `now - this.time` | **真实耗时**，不是固定 16.67 |
| HiDPI | `updateCanvasScaling()` | backing store 按 `devicePixelRatio/webkitBackingStorePixelRatio` 放大并 `ctx.scale()` |

> ⚠️ 最容易抄错的一点：`delta` 是真实毫秒差，速度单位是「像素/帧（60fps 基准）」，所以所有位移都要写成
> `x += speed * delta / msPerFrame`。写成 `x += speed` 在高刷屏上会快 2~4 倍。

### 2.3 全局参数（`Runner.config`，原样）

```js
ACCELERATION: 0.001,        // 每帧加速度（像素/帧²）
BG_CLOUD_SPEED: 0.2,
BOTTOM_PAD: 10,
CLEAR_TIME: 3000,           // 开局前 3s 不刷障碍
CLOUD_FREQUENCY: 0.5,
GAP_COEFFICIENT: 0.6,       // 障碍间距系数
GAMEOVER_CLEAR_TIME: 750,   // 撞死后 750ms 内按键不重开（防手滑）
GRAVITY: 0.6,
INITIAL_JUMP_VELOCITY: 12,  // ⚠️ 见 2.4：这个值实际没被用来起跳
INVERT_DISTANCE: 700,       // 每 700 分进一次夜间模式
INVERT_FADE_DURATION: 12000,
MAX_BLINK_COUNT: 3,
MAX_CLOUDS: 6,
MAX_OBSTACLE_LENGTH: 3,
MAX_OBSTACLE_DUPLICATION: 2,// 同类型障碍最多连续出现 2 次
MAX_SPEED: 13,
MIN_JUMP_HEIGHT: 35,
MOBILE_SPEED_COEFFICIENT: 1.2,
SPEED: 6,                   // 初速
SPEED_DROP_COEFFICIENT: 3,  // 下坠加速倍数
```

### 2.4 跳跃（`TRex`）

```js
startJump(speed) {
  if (this.jumping) return;
  this.jumpVelocity = this.config.INIITAL_JUMP_VELOCITY - speed / 10; // -10 - speed/10
  this.jumping = true;
  this.reachedMinHeight = false;
  this.speedDrop = false;
}

updateJump(delta) {
  const s = delta / animFrames[this.status].msPerFrame;   // 归一化到「帧」
  this.yPos += Math.round(this.jumpVelocity * s);          // 位移
  this.jumpVelocity += this.config.GRAVITY * s;            // 重力累加
  if (this.yPos < this.minJumpHeight || this.speedDrop) this.reachedMinHeight = true;
  if (this.yPos < this.config.MAX_JUMP_HEIGHT || this.speedDrop) this.endJump();
  if (this.yPos > this.groundYPos) { this.reset(); this.jumpCount++; }  // 落地
}

endJump() {   // 松开跳跃键：已经过了最低高度就强制进入下落
  if (this.reachedMinHeight && this.jumpVelocity < this.config.DROP_VELOCITY)
    this.jumpVelocity = this.config.DROP_VELOCITY;  // -5
}
```

TRex 私有 config：`DROP_VELOCITY: -5, GRAVITY: 0.6, INIITAL_JUMP_VELOCITY: -10, MAX_JUMP_HEIGHT: 30, MIN_JUMP_HEIGHT: 30, SPEED_DROP_COEFFICIENT: 3, HEIGHT: 47, HEIGHT_DUCK: 25, WIDTH: 44, WIDTH_DUCK: 59, START_X_POS: 50`

**关键手感机制（这是「小恐龙为什么好玩」的核心）：**

1. **短按 = 小跳，长按 = 大跳**。按住时不断 `endJump()` 被 `reachedMinHeight` 挡住，跳得高；一松手 `endJump()` 立刻把上升速度截断到 −5，马上落下。所以跳跃高度**由按住的时长决定**，不需要蓄力条。
2. **起跳速度随游戏速度变化**：`-10 - currentSpeed/10`，速度越快跳得越高一点，保证高速时仍能越过障碍（自我平衡）。
3. **下键 = 空中急坠 / 地面下蹲**：空中 `setSpeedDrop()` 把 `jumpVelocity` 设为 +1（向下）并按 `SPEED_DROP_COEFFICIENT=3` 放大位移；地面则切 `DUCKING` 姿态（碰撞盒从 6 个变成 1 个，且更矮，能钻过翼龙）。
4. **`Math.round` 是刻意的**：像素取整，避免亚像素抖动，也让手感「颗粒化」可预测。

### 2.5 主循环（`Runner.update`）

```js
update() {
  const now = getTime();
  let delta = now - (this.time || now);
  this.time = now;
  if (this.playing) {
    this.clearCanvas();
    if (this.tRex.jumping) this.tRex.updateJump(delta);
    this.runningTime += delta;
    const hasObstacles = this.runningTime > this.config.CLEAR_TIME;   // 开局 3s 无敌人
    this.horizon.update(delta, this.currentSpeed, hasObstacles, this.inverted);

    // ——— 碰撞 ———
    if (hasObstacles && checkCollision(this.horizon.obstacles[0], this.tRex)) this.gameOver();
    else {
      this.distanceRan += this.currentSpeed * delta / this.msPerFrame;   // ★ 距离 = 速度×时间
      if (this.currentSpeed < this.config.MAX_SPEED) this.currentSpeed += this.config.ACCELERATION;
      if (this.distanceMeter.update(delta, Math.ceil(this.distanceRan))) this.playSound(this.soundFx.SCORE);
      // 夜间模式：分数每跨过 INVERT_DISTANCE 触发一次 invert()
    }
  }
  this.tRex.update(delta);
  this.scheduleNextUpdate();
}
```

**计分不是积分累计，是距离换算**：`score = Math.round(distanceRan * 0.025)`（`DistanceMeter.config.COEFFICIENT`）。也就是**跑满 1000 距离 = 25 分**，每 100 分闪一次并响一声（`ACHIEVEMENT_DISTANCE: 100`）。速度上限 13 时大约 1.5s 加 0.025 的距离增速。

### 2.6 障碍物生成（`Horizon.updateObstacles`）

```js
// 只关心「最后一个障碍」：等它整体（含间距）滚进屏幕，才刷下一个
const last = obstacles[obstacles.length - 1];
if (last && !last.followingObstacleCreated && last.isVisible()
    && last.xPos + last.width + last.gap < WIDTH) {
  addNewObstacle(speed);
  last.followingObstacleCreated = true;
}
```

```js
addNewObstacle(speed) {
  const idx = getRandomNum(0, Obstacle.types.length - 1);
  const type = Obstacle.types[idx];
  if (this.duplicateObstacleCheck(type.type) || speed < type.minSpeed) {
    this.addNewObstacle(speed);           // 递归重摇，直到合法
    return;
  }
  // …push 新障碍，并记录到 obstacleHistory（最多 2 条）
}
```

障碍类型表（`Obstacle.types`）：

| type | width | height | yPos | minGap | minSpeed | multipleSpeed | 备注 |
|---|---|---|---|---|---|---|---|
| `CACTUS_SMALL` | 17 | 35 | 105 | 120 | 0 | 4 | 可 1~3 连（`size`） |
| `CACTUS_LARGE` | 25 | 50 | 90 | 120 | 0 | 7 | 可 1~3 连 |
| `PTERODACTYL` | 46 | 40 | [100,75,50] | 150 | **8.5** | 999 | 速度≥8.5 才出现；2 帧动画 6fps；`speedOffset: ±0.8` 随机让翼龙快/慢一点 |

- **间距**：`gap = round(width * speed + minGap * GAP_COEFFICIENT)`，再在 `[gap, gap*1.5]` 里随机（`MAX_GAP_COEFFICIENT = 1.5`）。速度越快间距越大 → 公平性保证。
- **连排**：`size = random(1, 3)`；当 `speed < multipleSpeed` 时强制 `size = 1`（低速不刷连排）。
- **防重复**：`obstacleHistory` 里同类型连续出现 ≥2 次就重摇。
- **移动**：`xPos -= Math.floor((speed + speedOffset) * 60 / 1000 * delta)`。

### 2.7 碰撞检测

**两段式**：先 AABB 粗判，再逐碰撞盒细判。

```js
// 粗判
function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
         a.y < b.y + b.height && a.height + a.y > b.y;
}
// 细判：障碍整体盒 vs 恐龙整体盒相交后，再逐个小盒比
```

恐龙的碰撞盒（**不是矩形**，是手工标注的 6 个小盒，贴合身体轮廓）：

```js
TRex.collisionBoxes = {
  RUNNING: [ [22,0,17,16], [1,18,30,9], [10,35,14,8], [1,24,29,5], [5,30,21,4], [9,34,15,4] ],
  DUCKING: [ [1,18,55,25] ],
};
```

> 这是「体感公平」的来源：视觉上贴边蹭过不算撞。**复刻时这是必须保留的细节**，用整块矩形会明显「太容易死」。

### 2.8 状态机与输入

`TRex.status`：`WAITING / RUNNING / JUMPING / DUCKING / CRASHED`，每种状态对应不同动画帧序列（`animFrames`，含 `msPerFrame`，如 RUNNING 12fps、DUCKING 125ms/帧）。

输入映射（`Runner.keycodes`，用 keyCode 而非 key）：

```js
keycodes = { JUMP: { 38:1, 32:1 }, DUCK: { 40:1 }, RESTART: { 13:1 } };
// 38 = ↑，32 = 空格，40 = ↓，13 = Enter
```

- 跳跃：`↑` / `空格` / 触摸 / 指针按下（**原版没有 W/S**）
- 下蹲 & 急坠：`↓`
- 重开（`onKeyUp` 里，仅在 `crashed` 时）：`Enter` 立即重开；`↑`/`空格` 需距撞死 ≥ `GAMEOVER_CLEAR_TIME`(750ms)；或左键点中 canvas
- 松开跳跃键 → `endJump()`

> 复刻时可顺手加上 `W`/`S`/`A`/`D` 等现代键位，但要保证 `↑`/`空格`/`↓` 行为与原版一致。

### 2.8b 最高分

这个构建里 `highestScore` **只是内存变量**，页面刷新即丢失（`809.js` 里没有任何 `localStorage` / `sessionStorage`）。Chrome 原版是由错误页控制器持久化的，不在 `offline.js` 内。
→ 我们的插件可以做得更好：最高分写宿主侧文件（或 `localStorage`），并在重开面板上显示。

首次输入时 `!this.playing` → `loadSounds()` + `setPlayStatus(true)` + `update()` 启动循环，即**游戏靠第一次按键启动**（同时满足浏览器自动播放策略）。

### 2.9 表现层细节（值得抄的「氛围」清单）

| 细节 | 实现 |
|---|---|
| 昼夜切换 | 每跨过 700 分触发 `invert()`，给 body 加 `.inverted`（CSS `filter: invert(100%)`），持续 12s；月亮 7 个相位 + 星星横移 |
| 云 | 最多 6 朵，`cloudSpeed 0.2`，间距 `MAX_CLOUD_GAP 400`，`CLOUD_FREQUENCY 0.5` 概率生成 |
| 地面 | 两条 600px 地平线纹理首尾相接循环滚动 |
| 分数闪烁 | 每 100 分 `achievement` 标记，`FLASH_DURATION 250ms` × `FLASH_ITERATIONS 3` |
| 待机眨眼 | 未开始时不跑循环，只在 `MAX_BLINK_COUNT` 次眨眼内继续 rAF |
| 撞死 | 停下来 + `CRASHED` 帧 + 重开按钮贴图 + 最高分**只存内存**（见 2.8b） |
| 音效 | press / hit / reached 三个，`AudioContext` 解码 `<template>` 里的 base64 mp3 |

---

## 三、DSH 插件机制（本机实测）

### 3.1 运行形态（重要）

- 当前是**官方桌面客户端 Electron**：`DSH_PROFILE=desktop`，profile 目录在 `%USERPROFILE%\.dsh\profiles\desktop`，GUI 是 `http://127.0.0.1:<port>`。
- 桌面端 `dsh plugin` CLI **按设计拒绝** `--profile desktop`，必须用宿主内置的 `plugin_manager` 工具安装。
- 桌面端页面 `dsh-app://app/` 的静态 dist 来自安装包（`dsh-web-frontend/dist`），**只有非静态请求才经 IPC 转发给宿主**（`protocol.handle` 里的 `forwardWebRequest`）。
  → 结论：**同源的 `/dsh-xxx/*` 路由在桌面端同样可达**（`dsh-whale-widget` 就是靠这个轮询 `/dsh-whale/balance.json`）。

### 3.2 插件包结构（以 `dsh-whale-widget` 为样本）

```text
my-plugin/
├── package.json        # name / version / type:module / main / icon + dsh.bundle.patch
├── cordis.patch.yml    # 挂载声明
├── icon.png            # 插件列表图标（正方形 256×256）
├── lib/index.js        # 宿主侧：export default { name, apply(root) }
└── assets/*.js         # 浏览器侧：由宿主路由按 mtime 热读下发
```

`package.json` 关键字段：

```json
{
  "name": "dsh-whale-jump",
  "type": "module",
  "main": "lib/index.js",
  "icon": "./icon.png",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: dsh-whale-jump
      name: dsh-whale-jump
```

宿主启动时按 bundle 层栈叠加各插件 patch，把条目插进 profile 配置树（本机 `cordis.yml` 里已能看到 `- id: dsh-whale-widget / name: dsh-whale-widget`）。profile 还需在 `package.json` 的 `dsh.profile.bundles` 里登记（`plugin_manager` 会自动做）。

### 3.3 宿主侧 API 面（`ctx.webServer`）

来自 `@deepseek-ai/dsh-host-webserver` 的类型定义（本项目运行时同版本已在 asar 内确认）：

```ts
register(route: { kind: 'exact' | 'prefix'; path: string; handler(req, res) }): () => void
registerUpgrade(route)          // WebSocket 升级，精确路径
registerFallback(handler)       // 全场兜底（已被 SPA dist 占用，别碰）
tapIndex(transform: (html: string) => string): () => void   // 改写 index.html
collectIndexInjections(): InjectionRow[]                    // 触发一次 webserver/index-inject
```

匹配顺序：**exact 全表 → 最长 prefix → fallback**。重复 `(kind, path)` 直接抛错。所有 register 都返回 disposer，必须用 `ctx.effect(() => () => disposers.forEach(d => d()))` 回收。

### 3.4 两条 index 注入通道

| 通道 | 生效范围 | 用法 |
|---|---|---|
| `ctx.webServer.tapIndex(html => html)` | `dsh web` / 浏览器形态（fallback owner 每次渲染 index 都跑） | 字符串替换，塞 `<script defer src="...">` |
| `ctx.on('webserver/index-inject', table => table.push(row))` | **桌面端唯一通道**（宿主启动时 `collectIndexInjections()` 一次性收集 → IPC → 页面侧逐行应用） | 结构化行 |

结构化行（`renderRow` 实测支持的行种类）：

| kind | 字段 | 渲染成 |
|---|---|---|
| `global` | `name`, `value` | `<script>globalThis[name] = value</script>`（head） |
| `script` | `text`, `placement` | `<script>text</script>` |
| `script-src` | `src`, `placement` | `<script src="..."></script>` |
| `script-preload` | `src` | `<link rel=preload>`（head） |
| `style` | `text` | `<style>…</style>`（head） |
| `html` | `html`, `placement` | 原样插入 |

> ⚠️ 来自 `dsh-whale-widget` 的实战教训（issue #152/#154）：
> 桌面端的注入表是**启动时收集一次并缓存**的，且页面侧对 `script-src` 行是「加载失败即 reject 整个 boot」。
> 因此桌面端推荐 **`kind:'script'` 内联行**，由我们自己在脚本里 `createElement('script')` 并吞掉 `onerror`——路由在就加载，路由没了也绝不拖垮宿主启动。

### 3.5 客户端 bundle 通道（可选，更「正规」）

宿主 `@deepseek-ai/dsh-client-modules` 会扫描 Loader 条目里声明了 `dsh.client` 的包：

```json
"dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-runtime"], "immediately": false } },
"exports": { "./client": "./lib/client.js" }
```

- 产物按 `/plugins/<id>/client.js?rev=<hash>` 下发，浏览器侧是**懒 CJS**：执行脚本只做 `window.__ModuleLoader__.load({ id, factory })` 注册，副作用（含 CSS 注入）延迟到首次 `import` 时在 factory 里跑。
- 分辨率分支：平台种子词 → 已物化记录 → shell 静态注册 → 已注册 factory → boot 图行（拉脚本）→ 否则抛错。
- 代价：需要 `tsdown`/打包、需要声明 `dsh.client`、且**必须真正被打包成单文件 bundle**。

> 现阶段建议：**先用「宿主路由 + 独立 assets JS + 结构化注入」这条最轻的路**（与 `dsh-whale-widget` 同构），跑通后再考虑升级成 `dsh.client` 正式 bundle。

### 3.6 安全边界（照抄 `dsh-whale-widget` 的做法）

- 所有写请求只接受回环来源（`127.0.0.1` / `localhost` / `::1`），非回环一律 403。
- 可委托宿主 `connection` 服务的 `requestRejection(req)`（旧宿主可能没有该方法 → 要以「抛异常即拒绝」的 fail-closed 方式处理）。
- 本小游戏属于**纯只读/无凭据**插件，风险面小；但仍建议只注册 GET 路由 + 本机存储最高分。

---

## 四、把恐龙机制映射到「鲸鱼跳」的设想（待实现）

| 恐龙原版 | 鲸鱼版设想 |
|---|---|
| T-Rex 在地面跑 | 小鲸鱼在**海面**起伏游动（上下浮动为正弦，非跳跃时） |
| 跳跃（重力 −10/0.6） | **跃出水面**（同样的 Δv/重力模型，可直接复用数值） |
| 下蹲 / 急坠 | **下潜**（碰撞盒变小、可躲过空中障碍） |
| 仙人掌 / 翼龙 | **珊瑚礁 / 海鸥 / 漂浮垃圾**（水下障碍与水面障碍分层，天然对应两套 y 轴） |
| 地面滚动纹理 | 水面波纹 + 水下气泡视差 |
| 昼夜 `invert()` | **日出/日落/深夜**三段色调（比纯反色更耐看） |
| 分数 = 距离 × 0.025 | 同样按距离计分（不要改成按时间） |
| 3 条音效 | 跃出水面 / 落水 / 撞击 / 每 100 分「鲸歌」 |
| 峰值手感：短按小跳长按大跳 | 原样保留（这是可玩性的根） |

**必须原样复刻的四件事**（少一个就「不像」）：
1. `delta` 用真实帧间隔，位移统一 `× delta/16.67`；
2. 松手即 `endJump()` 截断上升速度（决定跳跃手感）；
3. 恐龙式**多碰撞盒**（贴边不算撞）；
4. 障碍间距 `width*speed + minGap*coef` 随速度放大（公平性）。

---

## 五、本地留存的原始资料

下载到的原站资源（临时目录，会被系统清理，仅作对照）：

| 文件 | 内容 |
|---|---|
| `809.js` | **游戏本体**（dinorunner chunk，118KB；`809.pretty.js` 为换行美化版） |
| `index.html` | 页面结构 + 内联精灵图/音效 base64 |
| `dino_default.css` | 页面与 `.inverted` 昼夜样式 |
| `app.js` / `229.js` / `54.js` / `77.js` | 站点框架层（计分上报 `postResults` 等，非必需） |

路径：`%TEMP%\dino\`（用 `_study/fetch_js.mjs` 可重新下载）。

---

## 六、下一步（待用户确认后再动手）

1. 生成插件骨架 `dsh-whale-jump/`（package.json + cordis.patch.yml + lib/index.js + assets/game.js + icon.png）。
2. 宿主侧：注册 `/dsh-whale-jump/game.js` 路由（按 mtime 热读）+ `webserver/index-inject` 桌面行 + `tapIndex` 浏览器行 + 最高分 GET/POST 路由。
3. 前端：canvas 实现（鲸鱼为代码绘制或内置 SVG，不依赖外部图片），完整移植 2.4~2.8 的机制。
4. 用 `plugin_manager` 装入 `desktop` profile，重启客户端验证（F5 / 完全退出重开）。
