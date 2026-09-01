import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const USE_PREVIEW = process.env.INKSTONE_MEASURE_PREVIEW === '1'
const APP_URL = USE_PREVIEW ? 'http://127.0.0.1:7713/' : 'http://127.0.0.1:7712/'
const DEBUG_PORT = 9333
const CHROME = fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : 'google-chrome'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForUrl(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
    }
    await sleep(250)
  }
  throw new Error(`timed out waiting for ${url}`)
}

class CdpClient {
  constructor(ws) {
    this.ws = ws
    this.nextId = 1
    this.pending = new Map()
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error) reject(new Error(message.error.message))
        else resolve(message.result)
      }
    })
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })
    return new CdpClient(ws)
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP ${method} timed out`))
      }, 60_000)
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    try {
      this.ws.close()
    } catch {
    }
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) {
    throw new Error(`evaluate failed: ${JSON.stringify(result.exceptionDetails)}`)
  }
  return result.result.value
}

async function waitFor(cdp, expression, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return
    await sleep(120)
  }
  throw new Error(`timed out waiting for condition: ${expression}`)
}

const INSTALL = `(() => {
  window.__lt = { count: 0, total: 0, max: 0 }
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__lt.count += 1
      window.__lt.total += entry.duration
      window.__lt.max = Math.max(window.__lt.max, entry.duration)
    }
  }).observe({ type: 'longtask' })
  window.__waitForDialog = () => new Promise((resolve) => {
    if (document.querySelector('[role="dialog"]')) { resolve(performance.now()); return }
    const obs = new MutationObserver(() => {
      if (document.querySelector('[role="dialog"]')) {
        obs.disconnect()
        resolve(performance.now())
      }
    })
    obs.observe(document.body, { childList: true, subtree: true })
  })
  window.__waitForAttr = (selector, attr) => new Promise((resolve) => {
    const node = document.querySelector(selector)
    if (!node) { resolve(-1); return }
    const obs = new MutationObserver(() => {
      obs.disconnect()
      resolve(performance.now())
    })
    obs.observe(node, { attributes: true, attributeFilter: [attr] })
  })
  window.__ltSnapshot = () => {
    const lt = window.__lt
    return { longtasks: lt.count, totalMs: Math.round(lt.total * 10) / 10, maxMs: Math.round(lt.max * 10) / 10 }
  }
  true
})()`

const report = {}
const step = (label) => console.error(`[measure] ${label}`)

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkstone-lt-'))
  const vite = USE_PREVIEW
    ? spawn('npx', ['vite', 'preview', '--mode', 'demo', '--host', '127.0.0.1'], { stdio: 'ignore' })
    : spawn('npm', ['run', 'dev:demo', '--', '--host', '127.0.0.1'], { stdio: 'ignore' })
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: 'ignore' })

  let cdp = null
  try {
    await waitForUrl(APP_URL)
    step('vite up')
    await waitForUrl(`http://127.0.0.1:${DEBUG_PORT}/json/version`)
    step('chrome up')

    const target = await fetch(
      `http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(APP_URL)}`,
      { method: 'PUT' },
    ).then((res) => res.json())

    step('cdp connected')
    cdp = await CdpClient.connect(target.webSocketDebuggerUrl)
    const consoleLogs = []
    cdp.ws.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data))
        if (message.method === 'Runtime.consoleAPICalled') {
          consoleLogs.push((message.params.args ?? []).map((arg) => arg.value ?? arg.description ?? '').join(' ').slice(0, 200))
        }
      } catch {
      }
    })
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')

    async function withDiagnostics(condition) {
      try {
        await waitFor(cdp, condition)
      } catch (error) {
        const state = await evaluate(cdp, `({ href: location.href, text: document.body.innerText.slice(0, 300), buttons: document.querySelectorAll('button').length, inputs: document.querySelectorAll('input').length })`).catch(() => null)
        throw new Error(`${error.message}; page=${JSON.stringify(state)}; console=${JSON.stringify(consoleLogs.slice(-15))}`)
      }
    }

    step('waiting for login form')
    await waitFor(cdp, `document.querySelector('input[type="password"]') !== null || document.querySelectorAll('button[aria-label]').length > 5`)
    step('login form ready')
    const loginState = await evaluate(cdp, `(async () => {
      const password = document.querySelector('input[type="password"]')
      if (!password) return 'workspace-already'
      const username = document.querySelector('input:not([type="password"])')
      if (!username) return 'no-login-form'
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(username, 'admin')
      username.dispatchEvent(new Event('input', { bubbles: true }))
      setter.call(password, 'password')
      password.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 60))
      const submit = document.querySelector('button[type="submit"], form button')
      if (submit) submit.click()
      return true
    })()`)
    if (loginState === 'no-login-form') throw new Error('login form not found')
    step('login submitted')

    report.loginState = loginState
    step('waiting for workspace')
    await withDiagnostics(`document.querySelectorAll('button[aria-label]').length > 5`)
    step('workspace ready')
    await sleep(1_500)
    await evaluate(cdp, INSTALL)
    step('collectors installed')

    step('measuring: settings open')
    const openSettings = `(() => {
      const matched = [...document.querySelectorAll('button[aria-label]')]
        .filter((el) => /^(?:\u8bbe\u7f6e|settings)$/i.test(el.getAttribute('aria-label') ?? ''))
      const button = matched.find((el) => el.offsetParent !== null) ?? matched[0]
      if (!button) return 'missing-settings-button'
      window.__matchedLabel = button.getAttribute('aria-label')
      window.__matchedCount = matched.length
      window.__openT0 = performance.now()
      window.__openWait = window.__waitForDialog()
      button.click()
      return 'clicked'
    })()`
    const clicked = await evaluate(cdp, openSettings)
    await sleep(1_000)
    const openCheck = await evaluate(cdp, `(async () => {
      const at = await Promise.race([window.__openWait, new Promise((r) => setTimeout(() => r(null), 8_000))])
      return { dialog: Boolean(document.querySelector('[role="dialog"]')), latencyMs: at === null ? null : Math.round((at - window.__openT0) * 10) / 10 }
    })()`)
    report.openSettingsClick = clicked
    report.openMatched = await evaluate(cdp, `({ label: window.__matchedLabel, count: window.__matchedCount })`)
    report.openCheck = openCheck
    await sleep(400)
    report.afterOpen = await evaluate(cdp, `window.__ltSnapshot()`)

    step('measuring: editor tab')
    const switchTab = `(() => {
      const button = [...document.querySelectorAll('[role="dialog"] nav button')]
        .find((el) => /(?:\u7f16\u8f91|editor)/i.test(el.textContent ?? ''))
      if (!button) return 'missing-editor-tab'
      const t0 = performance.now()
      button.click()
      return new Promise((resolve) => setTimeout(() => resolve(performance.now() - t0), 300))
    })()`
    report.openEditorTabMs = Math.round((await evaluate(cdp, switchTab)) * 10) / 10
    await sleep(400)

    step('measuring: switch toggle')
    report.toggleSwitchMs = await evaluate(cdp, `(async () => {
      const sw = document.querySelector('[role="dialog"] [role="switch"]')
      if (!sw) return -1
      const t0 = performance.now()
      const wait = window.__waitForAttr('[role="dialog"] [role="switch"]', 'aria-checked')
      sw.click()
      return (await wait) - t0
    })()`)
    await sleep(300)
    report.afterToggle = await evaluate(cdp, `window.__ltSnapshot()`)

    step('measuring: slider drag')
    report.sliderDragMs = await evaluate(cdp, `(async () => {
      const input = document.querySelector('[role="dialog"] input[type="range"]')
      if (!input) return -1
      const current = Number(input.value)
      const t0 = performance.now()
      const wait = window.__waitForAttr('[role="dialog"] input[type="range"]', 'aria-valuetext')
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, String(Math.min(Number(input.max), current + 3)))
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return (await wait) - t0
    })()`)
    await sleep(300)
    report.afterSlider = await evaluate(cdp, `window.__ltSnapshot()`)

    step('measuring: theme switch')
    await evaluate(cdp, `(() => {
      const button = [...document.querySelectorAll('[role="dialog"] nav button')]
        .find((el) => /(?:\u5916\u89c2|appearance)/i.test(el.textContent ?? ''))
      if (button) button.click()
      return true
    })()`)
    await sleep(500)
    report.themeSwitchMs = await evaluate(cdp, `(async () => {
      const group = [...document.querySelectorAll('[role="radiogroup"]')]
        .find((el) => /(?:\u4e3b\u9898|theme)/i.test(el.getAttribute('aria-label') ?? ''))
      if (!group) return -1
      const target = [...group.querySelectorAll('[role="radio"]')][1]
      if (!target) return -1
      const t0 = performance.now()
      const wait = window.__waitForAttr('html', 'data-theme')
      target.click()
      return (await wait) - t0
    })()`)
    await sleep(500)
    report.afterTheme = await evaluate(cdp, `window.__ltSnapshot()`)

    await evaluate(cdp, `document.querySelector('[aria-label*="\u5173\u95ed"], [aria-label*="close" i]')?.click() ?? true`)
    await sleep(300)

    step('measuring: palette open')
    const openPalette = `(() => {
      const button = [...document.querySelectorAll('button[aria-label]')]
        .find((el) => /(?:\u641c\u7d22|search|\u547d\u4ee4|command)/i.test(el.getAttribute('aria-label') ?? '') && el.offsetParent !== null)
      if (!button) return 'missing-palette-button'
      const t0 = performance.now()
      const wait = window.__waitForDialog()
      button.click()
      return wait.then((at) => at - t0)
    })()`
    report.openPaletteMs = Math.round((await evaluate(cdp, openPalette)) * 10) / 10
    await sleep(300)
    report.afterPaletteOpen = await evaluate(cdp, `window.__ltSnapshot()`)

    step('measuring: palette typing')
    report.paletteTypeMs = await evaluate(cdp, `(async () => {
      const input = document.querySelector('[role="combobox"]')
      if (!input) return -1
      const t0 = performance.now()
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, 'a')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 550))
      return performance.now() - t0
    })()`)
    report.afterPaletteType = await evaluate(cdp, `window.__ltSnapshot()`)
    step('done')
  } catch (error) {
    report.error = String(error?.message ?? error)
  } finally {
    if (cdp) cdp.close()
    chrome.kill()
    vite.kill()
    await sleep(300)
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }

  console.log(JSON.stringify(report, null, 2))
  process.exit(report.error ? 1 : 0)
}

const watchdog = setTimeout(() => {
  console.error('[measure] watchdog timeout, dumping partial report')
  console.log(JSON.stringify(report, null, 2))
  process.exit(1)
}, 170_000)
main().finally(() => clearTimeout(watchdog))
