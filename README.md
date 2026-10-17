# DSH 小鲸鱼跳（dsh-whale-jump）

等回复时玩一局。DSH 对话流下方的一行轻量入口，点开是 canvas 跑酷小游戏。

![小鲸鱼跳](assets/whale-hero.png)

## 它长什么样

入口是输入框下方的一行小字，三态文案：

| 状态 | 文案 |
|---|---|
| 新会话空状态页 | **🐳 小鲸鱼跳** |
| 空闲 / 普通对话 | 🐳 等太久了？先玩个小游戏~ |
| 我已经跑了 20 秒以上 | 🐳 还在跑…要不要来一局？（**提亮并开始摆动**） |

三种状态共用同一个插槽组件，不重复注册。等待越久越显眼——这行字平时很淡，不打扰。

> 上表的中文只是示例；实际文案跟随 DSH 的语言设置（见下方「语言」）。

## 玩法

游戏有**三层空间**，每层要用不同动作应对：

| 障碍 | 位置 | 怎么躲 |
|---|---|---|
| 珊瑚 / 漂浮木 | 露出水面 | **跃出水面**（按住跳更高） |
| **灯塔**（高耸岩柱） | 露出水面，**128px 高** | **下潜**——无论怎么跳都会撞 |
| 海鸥 | 悬在水面上方 | **下潜**（跳起来反而会撞） |
| 水母 | 沉在水面下 | **留在水面**（下潜会撞） |

> 灯塔是唯一**跳不过去**的障碍：最高速下跳跃峰值 107.7px，角色碰撞盒底沿停在 104，
> 而灯塔顶部在 74 —— 差 30px，跳不过去。但下潜到 -45 以下就能完全躲开。

**开局水母更密集**：开局 25 秒内水母权重 ×3，实测占比约 **34%**，之后回落到约 14%。

操作：

- **空格 / ↑ / 点击**：跃出水面；在水下时按它则上浮
- **按住跳更高**：轻点小跳、按住大跳（可变跳跃高度）
- **↓**：下潜（按住潜更深，最多 52px）；**空中按下 = 急坠**
- **Esc**：退出
- **游戏结束后**：点「再来一局」按钮，或直接按**空格**重开

### 氧气（下潜的硬约束）

左上角有氧气条。**满氧可连续下潜 4 秒，从空回满需要 8 秒**（恢复速度正好是消耗的一半）。

- 只要身体在水下就消耗，浮出水面就恢复
- 耗尽会**强制上浮**并锁定下潜，必须回到 **30%** 才解锁
- 满氧时氧气条很淡；低于 50% 转橙、低于 25% 转红并脉动

## 实现要点

### 为什么不用 index 注入

桌面端（Electron）的注入表只在宿主启动时收集一次并缓存，且页面侧对 `script-src` 行是「加载失败即 reject 整个 boot」。所以本插件走 **DSH 官方 client module 通道**（`dsh.client` + `exports["./client"]`），由 DSH 自己的模块系统在 `/plugins/dsh-whale-jump/client.js` 下发并加载，完全不碰 index.html。

入口行注册在 `conversation.input.dock` 插槽——这个位置在**空状态页和对话中都会渲染**，一处注册同时覆盖两个场景。

### 语言

UI 文案**跟随 DSH 的语言设置**，不写死中文：

- 首选 `ctx.locale` 服务，也就是「设置 → 通用 → 语言」里选的那项；
  用户没选过时，该服务本身会退回浏览器推断值 —— 所以这一层等价于「用户实际在用的语言」。
- 拿不到 locale 服务时，依次看 `<html lang>` 与 `navigator.languages`。
- 仍然判不出来就落到简体中文。

目前支持 `zh` / `en`（DSH 也就这两个）。文案表挂在 `Proxy` 上，读 `T.idle`
时才解析语言，因此**切换语言后不需要重建任何东西**；入口行订阅了 locale
变更事件，切完立即重渲染，游戏浮层里的 HUD 文案也会在下一帧跟着变。

语言服务缺席时插件照常工作（走浏览器推断），不会因为缺依赖而挂掉。

### 手感是怎么调的

游戏机制参考了 Chromium T-Rex Runner 的公开玩法设计（不受版权保护的规则/方法层），代码全部重写：

| 机制 | 做法 |
|---|---|
| 帧率无关 | 位移统一 `× dt/16.67`，60fps 与 144fps 位移误差 <0.01% |
| 可变跳跃 | **不按住时每帧持续约束**上升速度，而不是松手时截一次 |
| 宽容碰撞 | 碰撞盒比绘制范围窄（44%），贴边蹭过不算撞 |
| 公平间距 | `gap = w×speed + 72`，随速度放大，高速时给同样的反应时间 |
| 难度阶梯 | 障碍高度 24/30/44/58px，轻点可过最低档，最高档必须按住 |
| 下潜 | 按住**持续加速下潜**（上限 52px），松开靠浮力回浮；不能只给初速，否则衰减完会自己浮回去 |
| 分层解锁 | 海鸥 ≥8、灯塔 ≥6 的当前速度才出现；水母无门槛且开局 ×3 权重 |
| 动作冲突 | 相邻障碍要求**相反动作**（一个要跳、一个要潜）时，间距再 ×1.7，避免来不及切换 |

这些都有回归测试覆盖（`_study/` 下 7 个套件、共 116 项）。

### 美术

角色立绘是**用户提供的原创图**，插件里只做背景抠图（边界洪水填充 + 1px 羽化，保留围裙和褶边的内部白色）与缩放，未做任何重绘。

因为只有一张正面立绘、没有跑动帧，游戏用**程序化动画**表现：上下浮动、起跳拉长 / 下落压扁（squash & stretch）、下潜前倾并随深度变淡、落水水花粒子。立绘加载失败时会退化成**代码绘制的鲸鱼**，保证任何情况下画面里都有主角。

珊瑚、漂浮木、灯塔、海鸥、水母、云、气泡、波纹、音效全部是代码现画/现合成的，不引用任何第三方素材。

## 安装

### 方式 A：从 GitHub 安装（推荐给其他人）

```powershell
dsh plugin --profile desktop add "github:CharlieChang1216/dsh-whale-jump"
```

或固定版本：

```powershell
dsh plugin --profile desktop add "github:CharlieChang1216/dsh-whale-jump#v0.1.0"
```

> 官方桌面端若拒绝命令行安装，请在桌面端会话里让 DSH 用内置 `plugin_manager` 安装
> `dsh-whale-jump`（来源填 GitHub 仓库地址）。`dsh plugin` 需要 pnpm 在 PATH 上。

### 方式 B：本地开发安装（软链，改源码即时生效）

```powershell
dsh plugin --profile desktop add "link:<你的仓库路径>"
```

装完**完全退出客户端（含系统托盘）再重新打开**。`link:` 是软链安装，改源码即时生效（宿主侧改动需重启），但**不要移动仓库目录**，移动后要重新 `add` 一次。

## 自检

```powershell
# 1) 插件已登记
Select-String -Path "$env:USERPROFILE\.dsh\profiles\desktop\package.json" -Pattern "dsh-whale-jump"

# 2) 宿主路由活着（端口以实际为准，看界面 URL）
curl http://127.0.0.1:61963/dsh-whale-jump/diag          # 诊断：版本 / 立绘状态 / 最近错误
curl http://127.0.0.1:61963/dsh-whale-jump/state         # → {"best":0,"plays":0}
curl -o hero.png http://127.0.0.1:61963/dsh-whale-jump/hero.png

# 3) 状态文件
Get-Content "$env:USERPROFILE\.dsh\.dshwj-state.json"
```

游戏里拿到分后，`state` 的 `best`/`plays` 会变——这是确认「路由 + 前端 + 落盘」整条链路都通的最终证据。

### 排障

**路由返回空的 400**：宿主把 handler 抛出的异常吞成了 `400` 空响应，真实原因记在
`/dsh-whale-jump/diag` 的 `heroError` / `lastError`（该接口仅回环可读）。
这个坑实际踩过一次，见下方「已知问题」。

**改了 `lib/index.js` 但没生效**：宿主侧代码**不热重载**，必须完全退出客户端（含系统托盘）再重开。
`lib/client.js` 是热读的，改完刷新页面即可。

**移动/改名了仓库目录，角色变成一只代码画的蓝色小鲸鱼**：宿主在加载插件时就把包根路径
（`PACKAGE_ROOT`）固化了，之后读立绘还在用旧路径，于是 `/hero.png` 返回 404，前端退化成
内置的兜底鲸鱼。修法：

```powershell
# 1) 把软链指向新目录（junction 而不是拷贝，才不会丢实时生效）
Remove-Item "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-whale-jump" -Force
New-Item -ItemType Junction -Target "<新路径>" -Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-whale-jump"

# 2) 改 profile/package.json 里的 link: 路径，否则下次 pnpm install 会指回去
# 3) 完全退出客户端再重开
```

判断是否已生效：`/dsh-whale-jump/diag` 的 `hero.exists` 应该从 `false` 变 `true`。

### 已知问题

- **陈旧进程假象**：如果宿主进程还在跑旧版 `lib/index.js`，新加的路由会 404、改过的路由可能
  返回空 400。这不是代码缺陷，重启即好。第一次部署时 `/hero.png` 恒定 400 就是这个原因。
- **移动目录不需要重新 `add`，但一定需要重启**：软链改了只解决"包能不能被找到"，
  包根路径是进程启动时算好的，不重启不会重新计算。

## 目录

```text
dsh-whale-jump/
├── package.json          # dsh.bundle.patch + dsh.client + files 白名单
├── cordis.patch.yml      # 挂载声明
├── lib/
│   ├── index.js          # 宿主侧：状态路由（GET/POST）+ 立绘路由 + 诊断
│   └── client.js         # 客户端侧：入口行组件 + 游戏引擎 + 浮层（无构建步骤）
├── assets/
│   ├── whale-hero.png    # 角色立绘（透明底）
│   ├── whale-hero@2x.png # 2x 版本
│   └── whale-icon.png    # 插件列表图标
├── docs/
│   └── miniwhale-source.jpg  # 角色原图（来源存档，不参与运行）
├── _study/               # 开发工具：测试套件 / 抠图 / 预览渲染 / 校准
│   ├── test-*.cjs        # 7 个测试套件，共 116 项
│   ├── make_assets.py    # 由原图生成 assets/（可复现字节一致）
│   └── dino-game-study.md# 恐龙游戏机制的学习笔记
├── .github/workflows/test.yml  # CI：语法检查 + 全部测试
├── PROVENANCE.md         # 素材来源与许可范围
├── LICENSE               # MIT（仅代码）
└── README.md
```

**没有构建步骤**：`lib/client.js` 是手写的、DSH 客户端模块系统可直接消费的格式，
所以仓库里没有打包配置，clone 下来就能用。

## 开发

```bash
npm test          # 跑全部 7 个套件（116 项）
npm run test:engine
npm run test:oxygen
```

测试只用 Node 内置模块（`node:fs` / `node:path` / `node:vm`），**不需要 `npm install`**。

运行时数据：`$DSH_HOME/.dshwj-state.json`（最高分、局数）。

## 安全边界

- 状态写接口（POST）**只接受回环来源**，非本机一律 403；请求体上限 8KB，分数范围校验。
- 不读写凭据、不联网、不碰 profile 配置。

## 许可

**代码** MIT（见 [`LICENSE`](LICENSE)）。

**美术素材**（`assets/`、`docs/`）不在 MIT 覆盖范围内，来源与权利状态见
[`PROVENANCE.md`](PROVENANCE.md)。玩法机制参考 Chromium T-Rex Runner（BSD-3-Clause）
的公开设计，但**不含其任何代码或美术素材**；画面与音效均为原创。
本项目与 Google LLC 无关，未使用任何 Google 商标。
