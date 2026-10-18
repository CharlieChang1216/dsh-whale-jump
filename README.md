- 🌐 [English](README.en.md) ｜ 简体中文

# DSH 小鲸鱼跳（dsh-whale-jump）

![小鲸鱼跳](assets/whale-hero.png)

DeepSeek Harness 等回复时的小游戏挂件：对话流下方一行轻量入口，点开是 canvas 跑酷小游戏（跳跃 / 下潜 / 氧气 / 计分 / 最高分），**纯本地、零依赖、不联网**。

> 代码部分 MIT 许可（见 [`LICENSE`](LICENSE)）；`assets/` 美术素材不在 MIT 范围内，来源与权利状态见 [`PROVENANCE.md`](PROVENANCE.md)。

## 特性

### 入口与状态

- 🐳 **一行入口**：注册在 `conversation.input.dock` 插槽，**空状态页和对话中都会渲染**，一处注册覆盖两个场景
- 🔔 **三态文案**：新会话空状态页 → **🐳 小鲸鱼跳**；空闲对话 → 🐳 等太久了？先玩个小游戏~；宿主已跑 20 秒以上 → 🐳 还在跑…要不要来一局？（**提亮并开始摆动**）
- 🌫️ **不打扰**：这行字平时很淡，等待越久越显眼，共用同一个插槽组件，不重复注册

### 玩法

- 🏝️ **三层空间**：露出水面的珊瑚 / 漂浮木要**跃过**（按住跳更高）；**灯塔**（128px 高）和海鸥要**下潜**；沉在水下的水母要**留在水面**
- 🗼 **灯塔跳不过去**：最高速下跳跃峰值 107.7px，灯塔顶部在 74px——唯一必须下潜的障碍；下潜到 -45 以下可完全躲开
- 🎈 **开局水母更密集**：开局 25 秒内水母权重 ×3（占比约 **34%**），之后回落到约 14%
- 🫧 **氧气系统**：满氧可连续下潜 4 秒，从空回满需 8 秒；耗尽**强制上浮**并锁定下潜，回到 30% 才解锁；低于 50% 氧气条转橙、低于 25% 转红并脉动
- 🎮 **操作**：空格 / ↑ / 点击 = 跳跃（按住跳更高）；↓ = 下潜（空中按下 = 急坠）；Esc = 退出；结束后空格或按钮重开

### 交互与手感

- ⏱️ **帧率无关**：位移统一 `× dt/16.67`，60fps 与 144fps 位移误差 <0.01%
- 🤗 **宽容碰撞**：碰撞盒比绘制范围窄（44%），贴边蹭过不算撞
- 📏 **公平间距**：`gap = w×speed + 72`，随速度放大，高速时给同样的反应时间
- 🪜 **难度阶梯**：障碍高度 24/30/44/58px 四档，轻点可过最低档，最高档必须按住
- ↔️ **动作冲突保护**：相邻障碍要求相反动作时，间距再 ×1.7，避免来不及切换

### 语言

- 🌐 **跟随 DSH 语言设置**：首选 `ctx.locale` 服务（「设置 → 通用 → 语言」），退回 `<html lang>` 与 `navigator.languages`，最后落到简体中文
- ⚡ **切换即时生效**：文案表挂在 `Proxy` 上读取时才解析语言，入口行订阅 locale 变更事件，切完立即重渲染，**不需要重建任何东西**
- 🛡️ **优雅降级**：语言服务缺席时插件照常工作（走浏览器推断），不会因为缺依赖挂掉

### 美术与实现

- 🎨 **程序化动画**：只有一张正面立绘、没有跑动帧——上下浮动、起跳拉长 / 下落压扁（squash & stretch）、下潜前倾随深度变淡、落水水花粒子全部由代码表现
- 🖼️ **立绘兜底**：立绘加载失败时退化成**代码绘制的鲸鱼**，任何情况下画面里都有主角
- 🧱 **珊瑚、漂浮木、灯塔、海鸥、水母、云、气泡、波纹、音效全部代码现画 / 现合成**，不引用任何第三方素材
- 🔌 **官方注入通道**：走 DSH 官方 client module 通道（`dsh.client` + `exports["./client"]`），由 DSH 模块系统在 `/plugins/dsh-whale-jump/client.js` 下发加载，**完全不碰 index.html**，绕开桌面端 `script-src` 注入失败连坐整个 boot 的坑
- 🔒 **安全边界**：状态写接口（POST）**只接受回环来源**，非本机一律 403；请求体上限 8KB，分数范围校验；不读写凭据、不联网、不碰 profile 配置

## 目录结构

```text
dsh-whale-jump/
├── package.json          # dsh.bundle.patch + dsh.client + files 白名单
├── cordis.patch.yml      # 挂载声明
├── lib/
│   ├── index.js          # 宿主侧：状态路由（GET/POST）+ 立绘路由 + 诊断
│   └── client.js         # 客户端侧：入口行组件 + 游戏引擎 + 浮层（无构建步骤）
├── assets/
│   ├── whale-hero.png    # 角色立绘（透明底）
│   └── whale-icon.png    # 插件列表图标
├── docs/
│   └── miniwhale-source.jpg  # 角色原图（来源存档，不参与运行）
├── _study/               # 开发工具：测试套件 / 抠图 / 预览渲染 / 校准
│   ├── test-*.cjs        # 8 个测试套件，共 128 项
│   ├── make_assets.py    # 由原图生成 assets/（可复现字节一致）
│   └── dino-game-study.md# 恐龙游戏机制的学习笔记
├── .github/workflows/test.yml  # CI：语法检查 + 全部测试
├── PROVENANCE.md         # 素材来源与许可范围
├── LICENSE                # MIT（仅代码）
└── README.md
```

**没有构建步骤**：`lib/client.js` 是手写的、DSH 客户端模块系统可直接消费的格式，仓库里没有打包配置，clone 下来就能用。

## 安装

同一份代码支持两种官方形态，装法只差 profile 名：

| | Web（`dsh web`，浏览器 UI） | 桌面端（Electron 客户端） |
| --- | --- | --- |
| profile | `web` | `desktop` |
| 安装 | `dsh plugin --profile web add "<源>"` | `dsh plugin --profile desktop add "<源>"` |
| 启动 | `dsh web` 后打开它打印的地址 | 直接打开客户端 |
| 前置条件 | `dsh` 在 PATH 上 | **先完整启动一次桌面客户端，再完全退出** |

> 桌面端缺少「开机一次」这一步时，`dsh plugin --profile desktop` 会以这个错误退出：`Open DeepSeek Harness Desktop once to initialize its profile, then fully quit it before running dsh plugin --profile desktop.` 这不是插件的问题，是桌面端的 profile 由客户端首次启动时生成。

### 方式 A：从 GitHub 安装（推荐给其他人）

**Web：**

```powershell
dsh plugin --profile web add "github:CharlieChang1216/dsh-whale-jump"
dsh web
```

**桌面端：**

```powershell
dsh plugin --profile desktop add "github:CharlieChang1216/dsh-whale-jump"
```

固定版本（`<tag>` 换成 Releases 里的标签，例如 `v0.1.1`）把源写成 `github:CharlieChang1216/dsh-whale-jump#v0.1.1` 即可，两种形态同理。

首次从 GitHub 安装要 clone 整个仓库，网络慢时 pnpm 会先报几次 `HEAD https://github.com/... ETIMEDOUT` 再重试成功（实测约 2 分钟），属正常现象。

### 方式 B：本地开发安装（软链，改源码即时生效）

```powershell
dsh plugin --profile web add "link:<你的仓库路径>"
# 或
dsh plugin --profile desktop add "link:<你的仓库路径>"
```

装完**完全退出客户端（含系统托盘）再重新打开**；Web 形态则是重启 `dsh web`。`link:` 是软链安装，改源码即时生效（宿主侧改动需重启），但**不要移动仓库目录**，移动后要重新 `add` 一次。

### 给 AI 的安装说明

- 本插件是标准 DSH bundle 插件，`main` 为 `lib/index.js`，靠 `cordis.patch.yml` 挂载、`exports["./client"]` 下发前端，**不需要构建**。
- 桌面端若命令行安装被拒（注入链只支持一次性收集、`dsh plugin` 需要 pnpm 在 PATH 上），请改用**桌面端会话里的内置 `plugin_manager`**，来源填 `https://github.com/CharlieChang1216/dsh-whale-jump`。
- 运行时数据写在 `$DSH_HOME/.dshwj-state.json`（最高分、局数），不碰 profile、不碰 node_modules（可能只读）。

## 兼容与运行要求

| 项目 | 要求 | 实测环境 |
| --- | --- | --- |
| DSH | **≥ 0.2.0** | 桌面端 `0.2.1-rc.2`（同版本 CLI） |
| Node.js | **≥ 20**（仅跑测试需要，插件本身零依赖） | `24.19.0` / `24.21.0` |
| pnpm | `dsh plugin` 内部使用，需在 PATH 上 | `11.28.5` |
| 操作系统 | 无平台特定 API | Windows 11 x64（macOS / Linux 未实测） |
| 浏览器 | 需要 Canvas 2D；`backdrop-filter` 可选（不支持只是背景不模糊） | Chromium / Edge |

**为什么是 DSH ≥ 0.2.0**：插件用到了 `dsh.client` 客户端模块通道（`/plugins/<id>/client.js`）、`conversation.input.dock` 插槽、`locale` 服务与 `webServer` 服务注册路由。实测环境是 `0.2.1-rc.2`；0.2.0 系列预期可用，0.1.x 未做验证，不做承诺。

**无需 `npm install`、无需构建、无运行时依赖**：`lib/client.js` 是手写的 DSH 客户端模块格式，`lib/index.js` 只用 Node 内置模块（`node:fs` / `node:path` / `node:url` / `node:os`）。

## 验证

```powershell
# 1) 插件已登记（桌面端把 web 换成 desktop）
Select-String -Path "$env:USERPROFILE\.dsh\profiles\web\package.json" -Pattern "dsh-whale-jump"

# 2) 宿主路由活着。端口每次启动都可能变——以 `dsh web` 打印的地址或客户端窗口地址栏为准
$port = 52135   # 换成你实际看到的端口

curl "http://127.0.0.1:$port/dsh-whale-jump/diag"       # 诊断：版本 / 立绘状态 / 最近错误
curl "http://127.0.0.1:$port/dsh-whale-jump/state"      # → {"best":0,"plays":0}
curl -o hero.png "http://127.0.0.1:$port/dsh-whale-jump/hero.png"

# 3) 状态文件
Get-Content "$env:USERPROFILE\.dsh\.dshwj-state.json"
```

游戏里拿到分后，`state` 的 `best`/`plays` 会变——这是确认「路由 + 前端 + 落盘」整条链路都通的最终证据。

## 常见问题

**路由返回空的 400**

宿主把 handler 抛出的异常吞成了 `400` 空响应，真实原因记在 `/dsh-whale-jump/diag` 的 `heroError` / `lastError`（该接口仅回环可读）。这个坑实际踩过一次（2026-10 的 `/hero.png` 恒定 400 就是靠它定位的）。

**改了 `lib/index.js` 但没生效**

宿主侧代码**不热重载**，必须完全退出客户端（含系统托盘）再重开。`lib/client.js` 是热读的，改完刷新页面即可。

**移动/改名了仓库目录，角色变成一只代码画的蓝色小鲸鱼**

宿主在加载插件时就把包根路径（`PACKAGE_ROOT`）固化了，之后读立绘还在用旧路径，于是 `/hero.png` 返回 404，前端退化成内置的兜底鲸鱼。修法：

```powershell
# 1) 把软链指向新目录（junction 而不是拷贝，才不会丢实时生效）
Remove-Item "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-whale-jump" -Force
New-Item -ItemType Junction -Target "<新路径>" -Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-whale-jump"

# 2) 改 profile/package.json 里的 link: 路径，否则下次 pnpm install 会指回去
# 3) 完全退出客户端再重开
```

判断是否已生效：`/dsh-whale-jump/diag` 的 `hero.exists` 应该从 `false` 变 `true`。

**陈旧进程假象**

如果宿主进程还在跑旧版 `lib/index.js`，新加的路由会 404、改过的路由可能返回空 400。这不是代码缺陷，重启即好。第一次部署时 `/hero.png` 恒定 400 就是这个原因。**移动目录不需要重新 `add`，但一定需要重启**：软链改了只解决「包能不能被找到」，包根路径是进程启动时算好的，不重启不会重新计算。

## 开发与维护

- 测试只用 Node 内置模块（`node:fs` / `node:path` / `node:vm`），**不需要 `npm install`**：

```bash
npm test          # 跑全部 8 个套件（128 项）
npm run test:engine
npm run test:oxygen
```

- CI（GitHub Actions，Node 20/22 矩阵）在每次 push / PR 时跑语法检查 + 全部测试 + 清单自检，本地与 CI 用同一组脚本。
- 运行时数据：`$DSH_HOME/.dshwj-state.json`（最高分、局数）。
- **版本号规则**：`0.1.x`，`x` 等于已发布的次数——第 1 次发布是 `0.1.1`，第 2 次是 `0.1.2`，`0.1.0` 保留为发布前的初始 tag。每次打 tag 前先改 `package.json` 的 `version`，再 `git tag v0.1.x && git push --tags`。

## 致谢

- 玩法机制参考了 Chromium T-Rex Runner（BSD-3-Clause）的公开设计（不受版权保护的规则/方法层），**代码全部重写**，不含其任何代码或美术素材；机制学习笔记见 `_study/dino-game-study.md`。

## 许可证

- **代码**：MIT（见 [`LICENSE`](LICENSE)）。
- **美术素材**（`assets/`、`docs/`）不在 MIT 覆盖范围内，来源与权利状态见 [`PROVENANCE.md`](PROVENANCE.md)：角色立绘为第三方用户发布的 AI 生成 DeepSeek 鲸鱼形象二创（原发布者声明可自由使用），插件里只做背景抠图与缩放，未做任何重绘。
