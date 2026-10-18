- 🌐 [简体中文](README.md) ｜ English

# DSH Whale Jump (dsh-whale-jump)

![Whale Jump](assets/whale-hero.png)

A tiny game widget for DeepSeek Harness to play while waiting for a reply: a lightweight entry line under the conversation input; open it to play a canvas endless-runner (jump / dive / oxygen / scoring / high score). **Fully local, zero dependencies, no network.**

> Code is MIT-licensed (see [`LICENSE`](LICENSE)); `assets/` art is outside MIT — its provenance and rights status are documented in [`PROVENANCE.md`](PROVENANCE.md).

## Features

### Entry point & state

- 🐳 **Single entry line**: registered in the `conversation.input.dock` slot, **rendered both on the empty-state page and during a conversation** — one registration covers both scenes
- 🔔 **Three states of copy**: empty-state page → **🐳 Whale Jump**; idle conversation → 🐳 Waited too long? Take a quick game break~; host running for 20s+ → 🐳 Still running… want a round? (**brightens and starts swaying**)
- 🌫️ **Non-intrusive**: the line stays dim normally and grows more prominent the longer you wait; reuses one slot component, no duplicate registration

### Gameplay

- 🏝️ **Three depth layers**: coral / driftwood above the surface must be **jumped over** (hold to jump higher); the **spire** (128px tall) and seagulls must be **dived under**; jellyfish submerged below the surface must be **left at the surface**
- 🗼 **The spire is unjumpable**: at top speed the jump peak is 107.7px while the spire top sits at 74px — the only obstacle you must dive under; dive to −45 or deeper to clear it completely
- 🎈 **Denser jellyfish at start**: jellyfish weight ×3 during the first 25 seconds (~**34%** share), then falls back to ~14%
- 🫧 **Oxygen system**: a full tank allows 4s of continuous diving; refilling from empty takes 8s; depletion **forces a surfacing** and locks diving until it recovers to 30%; below 50% the bar turns orange, below 25% red and pulses
- 🎮 **Controls**: Space / ↑ / click = jump (hold to jump higher); ↓ = dive (mid-air press = fast-fall); Esc = quit; after game over, Space or the button restarts

### Feel & tuning

- ⏱️ **Frame-rate independent**: movement uniformly scaled by `× dt/16.67`, so 60fps and 144fps differ by <0.01%
- 🤗 **Forgiving collision**: hitbox is narrower than the drawn shape (44%), so grazing the edge does not count as a hit
- 📏 **Fair spacing**: `gap = w×speed + 72`, scaled with speed so you get the same reaction time at high speed
- 🪜 **Difficulty ladder**: obstacle heights 24/30/44/58px across four tiers — a tap clears the lowest, the highest requires holding
- ↔️ **Action-conflict guard**: when adjacent obstacles demand opposite actions (one jump, one dive), spacing is multiplied by 1.7 to avoid impossible switches

### Language

- 🌐 **Follows the DSH language setting**: prefers the `ctx.locale` service (Settings → General → Language), falls back to `<html lang>` and `navigator.languages`, and finally to Simplified Chinese
- ⚡ **Instant switching**: the copy table is a `Proxy` resolved lazily on read; the entry line subscribes to locale-change events and re-renders immediately — **no rebuild needed**
- 🛡️ **Graceful degradation**: works fine without the locale service (browser inference), never crashes from a missing dependency

### Art & implementation

- 🎨 **Procedural animation**: with only one front-facing portrait and no run frames, everything is code-driven — bobbing, jump stretch / fall squash (squash & stretch), dive lean with depth fade, and splash particles
- 🖼️ **Portrait fallback**: if the portrait fails to load it degrades to a **code-drawn whale**, so there is always a main character on screen
- 🧱 **Coral, driftwood, spire, seagull, jellyfish, clouds, bubbles, ripples and sound effects are all drawn / synthesized in code** — no third-party assets
- 🔌 **Official injection channel**: uses the DSH official client-module channel (`dsh.client` + `exports["./client"]`), delivered and loaded by the DSH module system at `/plugins/dsh-whale-jump/client.js`, **never touching index.html** — sidestepping the desktop `script-src` failure that would otherwise take down the whole boot
- 🔒 **Security boundary**: the state write endpoint (POST) **accepts loopback sources only** (non-local → 403), caps body size at 8KB, and validates the score range; no credentials read/written, no network, no profile config touched

## Directory structure

```text
dsh-whale-jump/
├── package.json          # dsh.bundle.patch + dsh.client + files whitelist
├── cordis.patch.yml      # mount declaration
├── lib/
│   ├── index.js          # host side: state routes (GET/POST) + portrait route + diagnostics
│   └── client.js         # client side: entry-line component + game engine + overlay (no build)
├── assets/
│   ├── whale-hero.png    # character portrait (transparent)
│   └── whale-icon.png    # plugin-list icon
├── docs/
│   └── miniwhale-source.jpg  # source portrait (provenance archive, not used at runtime)
├── _study/               # dev tooling: test suites / cutout / preview render / calibration
│   ├── test-*.cjs        # 8 test suites, 128 cases total
│   ├── make_assets.py    # regenerate assets/ from the source (byte-reproducible)
│   └── dino-game-study.md# notes on the dino-game mechanics
├── .github/workflows/test.yml  # CI: syntax check + all tests
├── PROVENANCE.md         # asset provenance and licensing scope
├── LICENSE                # MIT (code only)
└── README.md
```

**No build step**: `lib/client.js` is hand-written in a format the DSH client module system consumes directly, so there is no bundler config — clone and go.

## Installation

The same code ships for both official forms; only the profile name differs:

| | Web (`dsh web`, browser UI) | Desktop (Electron client) |
| --- | --- | --- |
| profile | `web` | `desktop` |
| install | `dsh plugin --profile web add "<source>"` | `dsh plugin --profile desktop add "<source>"` |
| launch | run `dsh web`, open the URL it prints | just open the client |
| prerequisite | `dsh` on PATH | **start the desktop client fully once, then quit it completely** |

> Skip that one boot and `dsh plugin --profile desktop` exits with: `Open DeepSeek Harness Desktop once to initialize its profile, then fully quit it before running dsh plugin --profile desktop.` That is the desktop client generating its profile on first launch — not a plugin problem.

### Option A: Install from GitHub (recommended for others)

**Web:**

```powershell
dsh plugin --profile web add "github:CharlieChang1216/dsh-whale-jump"
dsh web
```

**Desktop:**

```powershell
dsh plugin --profile desktop add "github:CharlieChang1216/dsh-whale-jump"
```

To pin a version, use `github:CharlieChang1216/dsh-whale-jump#v0.1.1` (tag from Releases) as the source — same for both forms.

The first GitHub install clones the whole repo. On a slow network pnpm logs a few `HEAD https://github.com/... ETIMEDOUT` retries before succeeding (about 2 minutes in our test) — that is expected.

### Option B: Local dev install (symlink, source changes apply live)

```powershell
dsh plugin --profile web add "link:<your repo path>"
# or
dsh plugin --profile desktop add "link:<your repo path>"
```

After installing, **fully quit the client (including the system tray) and reopen it**; for the Web form, restart `dsh web`. `link:` is a symlink install — source changes apply live (host-side changes need a restart), but **do not move the repo directory**; after moving you must `add` it again.

### Install notes for AI

- This is a standard DSH bundle plugin; `main` is `lib/index.js`, mounted via `cordis.patch.yml` and delivered via `exports["./client"]` — **no build required**.
- If command-line install is rejected on desktop (the injection chain is collected only once at startup, and `dsh plugin` needs pnpm on PATH), install `dsh-whale-jump` from the **built-in `plugin_manager` inside a desktop session** instead, with source `https://github.com/CharlieChang1216/dsh-whale-jump`.
- Runtime data lives in `$DSH_HOME/.dshwj-state.json` (high score, play count); it never touches the profile or node_modules (which may be read-only).

## Compatibility & requirements

| Item | Requirement | Verified on |
| --- | --- | --- |
| DSH | **≥ 0.2.0** | desktop `0.2.1-rc.2` (same version for the CLI) |
| Node.js | **≥ 20** (tests only — the plugin itself has zero dependencies) | `24.19.0` / `24.21.0` |
| pnpm | used internally by `dsh plugin`, must be on PATH | `11.28.5` |
| OS | no platform-specific API | Windows 11 x64 (macOS / Linux untested) |
| Browser | needs Canvas 2D; `backdrop-filter` optional (without it the backdrop is simply not blurred) | Chromium / Edge |

**Why DSH ≥ 0.2.0**: the plugin relies on the `dsh.client` client-module channel (`/plugins/<id>/client.js`), the `conversation.input.dock` slot, the `locale` service, and registering routes on the `webServer` service. Our verified environment is `0.2.1-rc.2`; the 0.2.0 line is expected to work, while 0.1.x was not verified and carries no promise.

**No `npm install`, no build step, no runtime dependencies**: `lib/client.js` is hand-written in the DSH client-module format, and `lib/index.js` uses only Node built-ins (`node:fs` / `node:path` / `node:url` / `node:os`).

## Verification

```powershell
# 1) Plugin is registered (swap web for desktop on the desktop client)
Select-String -Path "$env:USERPROFILE\.dsh\profiles\web\package.json" -Pattern "dsh-whale-jump"

# 2) Host routes are alive. The port can change on every launch — copy it from the URL `dsh web` prints or from the client window's address bar
$port = 52135   # replace with the port you actually see

curl "http://127.0.0.1:$port/dsh-whale-jump/diag"       # diagnostics: version / portrait status / last error
curl "http://127.0.0.1:$port/dsh-whale-jump/state"      # → {"best":0,"plays":0}
curl -o hero.png "http://127.0.0.1:$port/dsh-whale-jump/hero.png"

# 3) State file
Get-Content "$env:USERPROFILE\.dsh\.dshwj-state.json"
```

After scoring in-game, `state`'s `best`/`plays` will change — that is the final proof the whole chain (router + frontend + persistence) works.

## FAQ

**Route returns an empty 400**

The host swallows handler exceptions into a blank `400`; the real cause is in `/dsh-whale-jump/diag`'s `heroError` / `lastError` (this endpoint is loopback-readable only). This was actually hit once — the constant `/hero.png` 400 in 2026-10 was debugged exactly this way.

**Changed `lib/index.js` but nothing happened**

Host-side code is **not hot-reloaded** — you must fully quit the client (incl. system tray) and reopen. `lib/client.js` is hot-read, so just refresh the page after editing.

**Moved/renamed the repo directory and the character became a code-drawn blue whale**

The host fixes the package root (`PACKAGE_ROOT`) when loading the plugin, so afterwards it still reads the portrait from the old path — `/hero.png` returns 404 and the frontend falls back to the built-in whale. Fix:

```powershell
# 1) Point the symlink at the new directory (a junction, not a copy, to keep live updates)
Remove-Item "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-whale-jump" -Force
New-Item -ItemType Junction -Target "<new path>" -Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-whale-jump"

# 2) Change the link: path in profile/package.json, otherwise the next pnpm install points it back
# 3) Fully quit the client and reopen
```

To confirm it took effect: `/dsh-whale-jump/diag`'s `hero.exists` should flip from `false` to `true`.

**Stale-process illusion**

If the host process is still running an old `lib/index.js`, newly added routes 404 and changed routes may return a blank 400. This is not a code defect — a restart fixes it. The constant `/hero.png` 400 on first deploy was exactly this. **Moving the directory does not need re-`add`, but absolutely needs a restart**: changing the symlink only fixes "can the package be found"; the package root is computed at process start and won't recompute without a restart.

## Development & maintenance

- Tests use only Node built-ins (`node:fs` / `node:path` / `node:vm`) — **no `npm install` needed**:

```bash
npm test          # run all 8 suites (128 cases)
npm run test:engine
npm run test:oxygen
```

- CI (GitHub Actions, Node 20/22 matrix) runs syntax check + all tests + manifest self-check on every push / PR, using the same scripts locally and in CI.
- Runtime data: `$DSH_HOME/.dshwj-state.json` (high score, play count).
- **Versioning rule**: `0.1.x` where `x` equals the number of releases so far — the 1st release is `0.1.1`, the 2nd is `0.1.2`, and `0.1.0` stays as the pre-release tag. Bump `version` in `package.json` first, then `git tag v0.1.x && git push --tags`.

## Acknowledgements

- Game mechanics reference the public design of Chromium's T-Rex Runner (BSD-3-Clause) — the non-copyrightable rules/methods layer. **All code is rewritten**, containing none of its code or art; the mechanics study notes are in `_study/dino-game-study.md`.

## License

- **Code**: MIT (see [`LICENSE`](LICENSE)).
- **Art assets** (`assets/`, `docs/`) are outside MIT coverage; their provenance and rights status are documented in [`PROVENANCE.md`](PROVENANCE.md): the character portrait is an AI-generated DeepSeek whale fan-art released by a third-party user (the original publisher stated it may be used freely), and the plugin only performs background cutout and scaling — no redrawing.
