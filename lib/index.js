/**
 * dsh-whale-jump —— 宿主侧。
 *
 * 职责很薄：插件登记 + 一个只读状态路由（最高分、版本）。
 *
 * 游戏本体**不放这里**：它装在 `lib/client.js` 里，由 DSH 自己的客户端模块系统
 * （`@deepseek-ai/dsh-client-modules`，`/plugins/<id>/client.js`）下发给浏览器，
 * 并在 `conversation.input.dock` 插槽里注册入口行。这样既不需要改 index.html，
 * 也不依赖 `tapIndex` / `script-src` 注入 —— 桌面端（Electron）那条注入链
 * 只有一次性收集、且 `script-src` 失败会连坐整个 boot，能绕开就绕开。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const STATE_FILE = path.join(DSH_HOME, '.dshwj-state.json')

/** 从包清单读版本，避免两处手写漂移。 */
const VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')).version || '0.0.0'
  } catch (err) {
    return '0.0.0'
  }
})()

function readJson(file, fallback) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch (err) {
    return fallback
  }
}

function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8')
    return true
  } catch (err) {
    return false
  }
}

/** 只回环：写请求不接受任何非本机来源。 */
function isLoopback(req) {
  const remote = String((req.socket && req.socket.remoteAddress) || '')
  const addr = remote.replace(/^::ffff:/, '')
  return addr === '127.0.0.1' || addr === '::1' || addr === 'localhost'
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(text),
  })
  res.end(text)
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(text)
}

/** 读 body，带长度上限（这是个游戏状态接口，不该有大于几 KB 的请求）。 */
function readBody(req, limit = 8192) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        req.destroy()
        resolve(null)
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(null))
  })
}

export default {
  name: 'dsh-whale-jump',

  apply(root) {
    root.inject(['webServer'], (ctx) => {
      const disposers = []

      // —— 状态：最高分 + 局数 + 版本 ——————————————————————————
      // 只存在 $DSH_HOME 里，不碰 profile，不碰 node_modules（可能只读）。
      let state = readJson(STATE_FILE, { best: 0, plays: 0 })
      if (typeof state.best !== 'number' || !Number.isFinite(state.best) || state.best < 0) state.best = 0
      if (typeof state.plays !== 'number' || !Number.isFinite(state.plays) || state.plays < 0) state.plays = 0

      const persist = () => writeJson(STATE_FILE, state)

      disposers.push(
        ctx.webServer.register({
          kind: 'exact',
          path: '/dsh-whale-jump/state',
          handler: async (req, res) => {
            if (req.method === 'GET' || req.method === 'HEAD') {
              sendJson(res, 200, { best: state.best, plays: state.plays })
              return
            }

            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'method not allowed' })
              return
            }

            // 写路径：只认本机来源，且必须是 JSON。
            if (!isLoopback(req)) {
              sendText(res, 403, 'local access only')
              return
            }

            const raw = await readBody(req)
            if (raw === null) {
              sendJson(res, 413, { error: 'payload too large' })
              return
            }

            let payload
            try {
              payload = JSON.parse(raw || '{}')
            } catch (err) {
              sendJson(res, 400, { error: 'invalid json' })
              return
            }

            const score = Number(payload && payload.score)
            if (!Number.isFinite(score) || score < 0 || score > 1e7) {
              sendJson(res, 400, { error: 'invalid score' })
              return
            }

            const rounded = Math.floor(score)
            state.plays += 1
            const isBest = rounded > state.best
            if (isBest) state.best = rounded
            persist()

            sendJson(res, 200, { best: state.best, plays: state.plays, isBest })
          },
        }),
      )

      // —— 立绘：直接下发 PNG 字节（按 mtime 缓存，换图不用重启宿主）——
      const HERO_FILE = path.join(PACKAGE_ROOT, 'assets', 'whale-hero.png')

      // 诊断槽：宿主把 handler 抛出的异常吞成 400 空响应（webserver 的 catch），
      // 没有这个槽就完全看不到原因。2026-10 那次 /hero.png 恒定 400 就是靠它定位的。
      // ⚠️ 必须定义在 heroBytes 之前：const 有 TDZ，逆序时 catch 分支会二次抛错。
      const diag = { heroError: null, lastError: null }

      let heroCache = { mtime: -1, buf: null }
      function heroBytes() {
        try {
          const stat = fs.statSync(HERO_FILE)
          if (heroCache.buf && heroCache.mtime === stat.mtimeMs) return heroCache.buf
          heroCache = { mtime: stat.mtimeMs, buf: fs.readFileSync(HERO_FILE) }
          return heroCache.buf
        } catch (err) {
          diag.heroError = String((err && err.stack) || err)
          return null
        }
      }

      // 诊断接口：只回报状态，不泄露路径之外的任何东西（路径本身已脱敏成相对名）。
      // 只允许本机读取，避免局域网里变成信息面。
      disposers.push(
        ctx.webServer.register({
          kind: 'exact',
          path: '/dsh-whale-jump/diag',
          handler: (req, res) => {
            if (!isLoopback(req)) {
              sendText(res, 403, 'local access only')
              return
            }
            const stat = (() => {
              try {
                const st = fs.statSync(HERO_FILE)
                return { exists: true, bytes: st.size }
              } catch (err) {
                return { exists: false, error: String((err && err.code) || err) }
              }
            })()
            sendJson(res, 200, {
              version: VERSION,
              hero: stat,
              heroError: diag.heroError,
              lastError: diag.lastError,
              routes: ['/dsh-whale-jump/state', '/dsh-whale-jump/hero.png'],
            })
          },
        }),
      )

      disposers.push(
        ctx.webServer.register({
          kind: 'exact',
          path: '/dsh-whale-jump/hero.png',
          handler: (req, res) => {
            try {
              const buf = heroBytes()
              if (!buf) {
                sendText(res, 404, 'hero image unavailable')
                return
              }
              res.writeHead(200, {
                'Content-Type': 'image/png',
                'Cache-Control': 'no-cache',
                'Content-Length': buf.length,
              })
              res.end(buf)
            } catch (err) {
              diag.lastError = String((err && err.stack) || err)
              if (!res.headersSent) sendText(res, 500, 'hero failed: ' + String((err && err.message) || err))
            }
          },
        }),
      )

      if (typeof ctx.effect === 'function') {
        ctx.effect(() => () => {
          for (const d of disposers) {
            try {
              d()
            } catch (err) {}
          }
        })
      }
    })
  },
}
