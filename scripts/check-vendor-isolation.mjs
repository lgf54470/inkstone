import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'

const HEAVY_VENDORS = [
  { name: 'qrcode.react', needles: ['QRCodeSVG'] },
  { name: '@dicebear/*', needles: ['micah'] },
  { name: 'client-zip', needles: ['predictLength', 'makeZip'] },
]

const STATIC_IMPORT_RE = /import"\.\/([A-Za-z0-9_.-]+\.js)"/g
const STATIC_FROM_RE = /from"\.\/([A-Za-z0-9_.-]+\.js)"/g
const DYNAMIC_LITERAL_RE = /import\("\.\/([A-Za-z0-9_.-]+\.js)"/g
const ASYNC_TABLE_RE = /"assets\/([A-Za-z0-9_.-]+\.js)"/g

function analyzeBuild(dir) {
  const indexHtml = path.join(dir, 'index.html')
  if (!existsSync(indexHtml)) return null
  const html = readFileSync(indexHtml, 'utf8')
  const entries = [...html.matchAll(/<script[^>]*type="module"[^>]*src="\.?\/([^"]+\.js)"/g)].map((m) => m[1].replace(/^assets\//, ''))
  const assetsDir = path.join(dir, 'assets')
  const chunkFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
  const staticDeps = new Map()
  const dynamicDeps = new Map()
  const sizes = new Map()
  const contents = new Map()
  for (const file of chunkFiles) {
    const text = readFileSync(path.join(assetsDir, file), 'utf8')
    contents.set(file, text)
    sizes.set(file, statSync(path.join(assetsDir, file)).size)
    const stat = new Set()
    for (const m of text.matchAll(STATIC_IMPORT_RE)) stat.add(m[1])
    for (const m of text.matchAll(STATIC_FROM_RE)) stat.add(m[1])
    staticDeps.set(file, stat)
    const dyn = new Set()
    for (const m of text.matchAll(DYNAMIC_LITERAL_RE)) dyn.add(m[1])
    for (const m of text.matchAll(ASYNC_TABLE_RE)) dyn.add(m[1])
    dynamicDeps.set(file, dyn)
  }
  const firstScreen = new Set(entries)
  const queue = [...entries]
  while (queue.length) {
    const cur = queue.pop()
    for (const dep of staticDeps.get(cur) ?? []) {
      if (!firstScreen.has(dep)) {
        firstScreen.add(dep)
        queue.push(dep)
      }
    }
  }
  return { dir, entries, firstScreen, dynamicDeps, sizes, contents, assetsDir }
}

function main() {
  const dirs = [path.resolve(process.argv[2] ?? 'dist/client')]
  const demo = path.resolve('dist/demo')
  if (existsSync(path.join(demo, 'index.html'))) dirs.push(demo)
  let failed = false
  for (const dir of dirs) {
    const build = analyzeBuild(dir)
    if (!build) {
      console.log(`[vendor] ${dir}: no index.html, skipped`)
      continue
    }
    const firstScreenList = [...build.firstScreen].sort()
    console.log(`\n[vendor] build: ${dir}`)
    console.log(`[vendor] entry: ${build.entries.join(', ')}`)
    console.log(`[vendor] first-screen static closure (${firstScreenList.length}): ${firstScreenList.join(', ')}`)
    for (const feature of HEAVY_VENDORS) {
      const hits = []
      for (const [file, text] of build.contents) {
        if (feature.needles.some((n) => text.includes(n))) hits.push(file)
      }
      const onScreen = hits.filter((h) => build.firstScreen.has(h))
      const refs = new Set()
      for (const [file, dyn] of build.dynamicDeps) for (const d of dyn) if (hits.includes(d)) refs.add(file)
      for (const h of hits) {
        const kb = (build.sizes.get(h) / 1024).toFixed(1)
        const who = [...refs].filter((r) => r !== h).sort()
        console.log(
          `[vendor]   ${feature.name}: ${h} (${kb} KiB) ${build.firstScreen.has(h) ? 'ON FIRST SCREEN' : 'isolated'}${who.length ? ` <- async refs: ${who.join(', ')}` : ''}`,
        )
      }
      if (hits.length === 0) console.log(`[vendor]   ${feature.name}: not present in browser output (worker-side or tree-shaken)`)
      if (onScreen.length > 0) {
        failed = true
        console.log(`[vendor]   FAIL: ${feature.name} leaked into first screen via ${onScreen.join(', ')}`)
      }
    }
  }
  if (failed) {
    console.error('[vendor] FAILED: heavy vendor code reached the first-screen bundle')
    process.exit(1)
  }
  console.log('[vendor] OK: all heavy vendors stay behind lazy boundaries')
}

main()