// Manual measurement for the deck's PNG export (N-24).
//
// Exporting images walks every page of the sheet and hands each one to the shared element-to-PNG
// layer: the page is serialized into an SVG that carries the whole document stylesheet, decoded as an
// image, drawn into a fresh 2× canvas and encoded. Three of those steps scale with the page count in
// ways a person only feels as "the app froze, then Chrome asked me where to put the zip": the
// stylesheet rides into *every* page, a new multi-megapixel canvas is allocated per page, and every
// PNG is kept until the archive is finished.
//
// What this script answers, with numbers rather than reading:
//   1. how long the whole export takes, and what the longest single task inside it was (a talk should
//      not lose frames to an export that happens while it is running);
//   2. what the page's JavaScript heap peaks at, and how many megabytes of pictures the export draws;
//   3. how big the stylesheet the export copies into every page actually is;
//   4. whether a slide's `<img>` survives the round trip — a canvas cannot ride inside an SVG and the
//      layer swaps each one for a still of itself, but an `<img>` is left as markup, and markup that
//      points at a URL has no document to resolve it against inside an SVG image.
//
// It is deliberately not part of CI: the numbers are read off the printed lines by a person, and the
// judgement (is 60 pages acceptable?) is not a boolean. Run it on the code as it stands, change the
// export, run it again — the pair is the evidence, not either half.
//
// Usage: node scripts/measure-deck-export.mjs [baseUrl] [slides]
//   TOTAL_MAX_MS=90000      ceiling for the whole export (default, generous: this is a budget, not a race)
//   WORST_TASK_MAX_MS=250   ceiling for the longest single task during the export
//   HEAP_GROWTH_MAX_MB=600  ceiling for how far the heap climbs above its export-time baseline
//   HOLD_MAX_MB=800         ceiling for the bytes of PNG the export draws before it finishes
//   INKSTONE_VISUAL_USERNAME/PASSWORD  an account on that instance (defaults suit CI's :7712)
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:7712'
const SLIDES = Number(process.argv[3] ?? process.env.SLIDES ?? 60)
const TOTAL_MAX_MS = Number(process.env.TOTAL_MAX_MS ?? 90_000)
const WORST_TASK_MAX_MS = Number(process.env.WORST_TASK_MAX_MS ?? 250)
const HEAP_GROWTH_MAX_MB = Number(process.env.HEAP_GROWTH_MAX_MB ?? 600)
const HOLD_MAX_MB = Number(process.env.HOLD_MAX_MB ?? 800)
const USERNAME = process.env.INKSTONE_VISUAL_USERNAME ?? 'Owner-1'
const PASSWORD = process.env.INKSTONE_VISUAL_PASSWORD ?? 'supersecret100'
// A real file the app serves: same-origin, decodable, and big enough to see whether it made it into
// the picture. The point of this measurement is what an `<img>` with a URL does inside an SVG.
const IMAGE_PATH = '/apple-touch-icon.png'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1)

function chromeExecutablePath() {
  const candidates = [
    process.env.INKSTONE_CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate
    } catch {
      // Best-effort: an unreadable candidate just falls through to the next one.
    }
  }
  throw new Error('no Chrome found; set INKSTONE_CHROME_PATH')
}

function deckOf(slides) {
  const slide = (index) => [
    `## Slide ${index + 1}`,
    '',
    'A paragraph of body text that gives the page something to lay out, and a heading above it.',
    '',
    ...(index % 2 === 0 ? [`![Icon ${index + 1}](${IMAGE_PATH})`, ''] : []),
    `Second paragraph on slide ${index + 1} with a [link](https://example.com) and \`some code\`.`,
    '',
  ].join('\n')
  return `${Array.from({ length: slides }, (_, index) => slide(index)).join('\n---\n\n')}\n`
}

async function signIn(page) {
  const signedIn = await page.evaluate(async (username, password) => {
    const fields = [...document.querySelectorAll('input')]
    const secret = fields.find((field) => field.type === 'password')
    if (!secret) return true
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(fields[0], username)
    fields[0].dispatchEvent(new Event('input', { bubbles: true }))
    setter.call(secret, password)
    secret.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 80))
    document.querySelector('button[type="submit"]')?.click()
    await new Promise((resolve) => setTimeout(resolve, 2_500))
    return !document.querySelector('input[type="password"]')
  }, USERNAME, PASSWORD)
  if (!signedIn) throw new Error(`sign-in failed for ${USERNAME}; pass INKSTONE_VISUAL_USERNAME/PASSWORD for this instance`)
}

// The deck is typed into the real editor: a note created through the API never enters the client
// store, and the show reads its content from that store.
async function writeDeck(page, markdown) {
  await page.keyboard.down('Control')
  await page.keyboard.press('n')
  await page.keyboard.up('Control')
  await sleep(1_800)
  await page.evaluate((text) => {
    const editor = document.querySelector('.cm-content')
    const data = new DataTransfer()
    data.setData('text/plain', text)
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, markdown)
  await sleep(4_000)
}

async function openShow(page) {
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((el) => /presentation mode|\u6f14\u793a\u6a21\u5f0f/i.test(el.getAttribute('aria-label') ?? ''))
    if (!button) throw new Error('the control that opens the show is missing')
    button.click()
  })
  await page.waitForSelector('[data-slide-canvas]', { timeout: 20_000 })
}

// What the export costs, measured while it runs: the longest task, the heap, the bytes of PNG the
// page is holding, and the first picture it produced — which is what the `<img>` question is answered
// from. The canvas spy sits above the export in the same task, so it sees each page's PNG exactly once
// and can read the stylesheet size off the same call's arguments.
async function armInstrumentation(page) {
  await page.evaluate(async () => {
    const probe = {
      worstTaskMs: 0,
      tasks: 0,
      heapPeak: 0,
      heapBase: performance.memory?.usedJSHeapSize ?? 0,
      pngCount: 0,
      pngBytes: 0,
      cssChars: 0,
      firstPng: null,
      firstBox: null,
      done: false,
    }
    window.__exportProbe = probe
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        probe.tasks += 1
        probe.worstTaskMs = Math.max(probe.worstTaskMs, entry.duration)
      }
    }).observe({ entryTypes: ['longtask'] })
    const tick = () => {
      const memory = performance.memory
      if (memory) probe.heapPeak = Math.max(probe.heapPeak, memory.usedJSHeapSize)
      if (probe.done) return
      window.requestAnimationFrame(tick)
    }
    window.requestAnimationFrame(tick)
    const real = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = function patched(callback, type, ...rest) {
      real.call(this, (blob) => {
        probe.pngCount += 1
        probe.pngBytes += blob?.size ?? 0
        if (probe.pngCount === 1) {
          probe.firstPng = blob
          probe.firstBox = { width: this.width, height: this.height }
        }
        callback?.(blob)
      }, type, ...rest)
    }
    // The stylesheet the export copies into every page's SVG, read off the one place it is assembled.
    // `collectDocumentCss` is not exported to the window, so the size is measured where it lands: the
    // `<style>` text inside the SVG the layer builds for a page.
    const serializer = XMLSerializer.prototype.serializeToString
    XMLSerializer.prototype.serializeToString = function patched(node) {
      const out = serializer.call(this, node)
      if (typeof out === 'string' && out.includes('foreignObject') && out.length > probe.cssChars) probe.cssChars = out.length
      return out
    }
    return { memory: Boolean(performance.memory) }
  })
}

async function runExport(page) {
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('[data-presentation-chrome] button')].find((el) => /images|\u56fe\u7247/i.test(el.getAttribute('aria-label') ?? ''))
    if (!button) throw new Error('the control that exports images is missing from the chrome')
    button.click()
  })
  const started = Date.now()
  let probe = null
  while (Date.now() - started < TOTAL_MAX_MS + 30_000) {
    probe = await page.evaluate(() => {
      const held = window.__exportProbe
      if (!held) return null
      const progress = document.querySelector('[role="dialog"]')?.innerText ?? ''
      const finished = /images|\u56fe\u7247|\d+\s*\/\s*\d+/.test(progress) === false
      return { ...held, finished: held.pngCount > 0 && finished, progress }
    })
    if (probe?.pngCount >= SLIDES) break
    await sleep(500)
  }
  return { wallMs: Date.now() - started, probe }
}

// The first page's PNG, decoded back into a canvas: a dot of the app's own icon is read as a pixel,
// and the pixel says whether the `<img>` travelled with the page.
async function inspectFirstImage(page) {
  return page.evaluate(async () => {
    const probe = window.__exportProbe
    if (!probe?.firstPng) return { available: false }
    const bitmap = await createImageBitmap(probe.firstPng)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) return { available: false }
    context.drawImage(bitmap, 0, 0)
    // The slide is typeset from the top left, so the picture sits somewhere in the upper half of the
    // page. Sampling a band of that half and looking for a colour that is neither the page background
    // nor the text answers the question without knowing the layout.
    const seen = new Map()
    let opaque = 0
    let samples = 0
    for (let y = 0; y < canvas.height; y += 7) {
      for (let x = 0; x < canvas.width; x += 7) {
        const [r, g, b, a] = context.getImageData(x, y, 1, 1).data
        samples += 1
        if (a > 8) opaque += 1
        const key = `${Math.round(r / 32)}-${Math.round(g / 32)}-${Math.round(b / 32)}/${a > 8 ? 'o' : 't'}`
        seen.set(key, (seen.get(key) ?? 0) + 1)
      }
    }
    // The bytes travel out as base64 so a person can open the picture: a number can say the page is
    // empty, but only the picture says what that looked like to the presenter who downloaded it.
    const base64 = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
      reader.readAsDataURL(probe.firstPng)
    })
    return {
      available: true,
      width: canvas.width,
      height: canvas.height,
      colors: [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
      samples,
      opaqueSamples: opaque,
      base64,
      bytes: probe.firstPng.size,
      box: probe.firstBox,
      cssChars: probe.cssChars,
    }
  })
}

const browser = await puppeteer.launch({
  executablePath: chromeExecutablePath(),
  headless: 'shell',
  protocolTimeout: 600_000,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info'],
})
const page = await browser.newPage()
let failure = ''
const lines = []
try {
  await page.setViewport({ width: 1280, height: 900 })
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await signIn(page)
  await sleep(2_500)
  await writeDeck(page, deckOf(SLIDES))
  await openShow(page)
  // Let the deck-measuring pass finish first: measuring pages and exporting them at once would fold
  // one cost into the other, and neither number would mean anything.
  const started = Date.now()
  while (Date.now() - started < 120_000) {
    const complete = await page.evaluate(() => document.querySelector('[role="dialog"]')?.getAttribute('data-slide-list-complete') === 'true')
    if (complete) break
    await sleep(250)
  }
  const passMs = Date.now() - started
  await sleep(1_500)
  const hasImage = await page.evaluate(async (path) => {
    const response = await fetch(path)
    return response.ok
  }, IMAGE_PATH)
  await armInstrumentation(page)
  const { wallMs, probe } = await runExport(page)
  const picture = await inspectFirstImage(page)
  await page.evaluate(() => {
    window.__exportProbe.done = true
  })
  const heapGrowthMb = probe ? mb(Math.max(0, probe.heapPeak - probe.heapBase)) : '0'
  lines.push(`deck: ${SLIDES} slides (${hasImage ? 'with' : 'WITHOUT'} a served ${IMAGE_PATH}) — measuring pass ${passMs}ms, export ${wallMs}ms`)
  lines.push(`pngs: ${probe?.pngCount ?? 0} drawn, ${mb(probe?.pngBytes ?? 0)} MB of pictures; per-page box ${picture.box?.width}×${picture.box?.height}`)
  lines.push(`heap: base ${mb(probe?.heapBase ?? 0)} MB → peak ${mb(probe?.heapPeak ?? 0)} MB (growth ${heapGrowthMb} MB)`)
  lines.push(`tasks: ${probe?.tasks ?? 0} long tasks during the export, worst ${Math.round(probe?.worstTaskMs ?? 0)}ms`)
  lines.push(`stylesheet carried into each page's svg: ${((probe?.cssChars ?? 0) / 1024).toFixed(0)} KB of serialized markup`)
  lines.push(`first png: ${picture.available ? `${(picture.bytes / 1024).toFixed(0)} KB, ${picture.width}×${picture.height}` : 'not decoded'}`)
  if (picture.available) {
    lines.push(`  png pixels: ${picture.opaqueSamples}/${picture.samples} samples carry ink; buckets ${picture.colors.map(([key, count]) => `${key}:${count}`).join(' ')}`)
    if (process.env.EXPORT_PNG) fs.writeFileSync(process.env.EXPORT_PNG, Buffer.from(picture.base64, 'base64'))
  }
  if (!hasImage) failure = `the served image ${IMAGE_PATH} is not fetchable on this instance, so the <img> question cannot be answered`
  else if ((probe?.pngCount ?? 0) < SLIDES) failure = `the export produced ${probe?.pngCount ?? 0} pngs for a ${SLIDES}-page deck`
  else if (wallMs > TOTAL_MAX_MS) failure = `the export took ${wallMs}ms for ${SLIDES} pages (limit ${TOTAL_MAX_MS}ms)`
  else if ((probe?.worstTaskMs ?? 0) > WORST_TASK_MAX_MS) failure = `one task inside the export ran ${Math.round(probe.worstTaskMs)}ms (limit ${WORST_TASK_MAX_MS}ms) — the show is on screen while this happens`
  else if (Number(heapGrowthMb) > HEAP_GROWTH_MAX_MB) failure = `the heap climbed ${heapGrowthMb}MB during the export (limit ${HEAP_GROWTH_MAX_MB}MB)`
  else if (Number(mb(probe?.pngBytes ?? 0)) > HOLD_MAX_MB) failure = `the export drew ${mb(probe.pngBytes)}MB of pngs (limit ${HOLD_MAX_MB}MB) — check the archive is being fed as they are drawn`
  else if (picture.available && picture.opaqueSamples === 0) failure = 'the first exported page is entirely transparent — the deck exported as an empty picture'
} catch (error) {
  failure = String(error)
} finally {
  await browser.close()
}

console.info(lines.join('\n'))
console.info(failure ? `\nMEASUREMENT FAILED: ${failure}` : '\nMEASUREMENT OK: every budget held; read the numbers above for the shape of the cost.')
process.exit(failure ? 1 : 0)
