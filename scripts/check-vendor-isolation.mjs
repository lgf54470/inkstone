import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { readChunks, firstPaintChunks, FIRST_PAINT_ROOT_PREFIXES } from './lib/boot-graph.mjs'

/**
 * Heavy renderers that must never be reachable without a user opening the surface that needs them.
 *
 * Each is watched by content rather than by an import edge, because a chunk's name is chosen by the
 * bundler and a library's own chunks are named by its own build. The needle therefore has to be a
 * string the **library** emits, not one the app also writes: `me-tpc` used to stand for mind-elixir
 * and matched the app's own merged mindmap-UI chunk as well, which reported a 675 KiB chunk of app
 * code as a library leak. `me-epd` is emitted by the library and by nothing else here.
 */
const HEAVY_VENDORS = [
  { name: 'qrcode.react', needles: ['QRCodeSVG'] },
  { name: '@dicebear/*', needles: ['micah'] },
  { name: 'mind-elixir', needles: ['me-epd'] },
  { name: '@excalidraw/excalidraw', needles: ['Excalifont'] },
  // echarts' own internal event namespace; it is the library's, not a name this app chooses.
  { name: 'echarts', needles: ['ec_inner_'] },
  // client-zip is deliberately not watched here. Both of its former needles (`predictLength`,
  // `makeZip`) are gone from the current minified output, so the entry could never fire — a guard
  // that cannot fail is worse than no guard, because it reads as coverage. Its size is still capped
  // by `check-bundle-budget` through the surface that pulls it in.
]

/**
 * Libraries already living in the boot graph, so the gate stays green while their fix is scheduled
 * and red for anything new. Stale entries fail below.
 *
 * - @dicebear/*: `app.tsx` → `components/primitives` → `lib/avatar.ts`, so the avatar generator is
 *   loaded for a spinner. Tracked by plan batch B11.
 * - qrcode.react: `app-shell` → `features/workspace` → the attachments barrel → `attachment-qr-modal`.
 *   Tracked by plan batch B6.
 */
const KNOWN_IN_BOOT = ['@dicebear/*', 'qrcode.react']

function analyzeBuild(dir) {
  const indexHtml = path.join(dir, 'index.html')
  if (!existsSync(indexHtml)) return null
  const html = readFileSync(indexHtml, 'utf8')
  const assetsDir = path.join(dir, 'assets')
  const build = readChunks(assetsDir)
  const boot = firstPaintChunks(build, html)
  return { dir, assetsDir, build, boot }
}

function main() {
  const dirs = [path.resolve(process.argv[2] ?? 'dist/client')]
  const demo = path.resolve('dist/demo')
  if (existsSync(path.join(demo, 'index.html'))) dirs.push(demo)
  let failed = false
  for (const dir of dirs) {
    const analyzed = analyzeBuild(dir)
    if (!analyzed) {
      console.log(`[vendor] ${dir}: no index.html, skipped`)
      continue
    }
    const { build, boot } = analyzed
    console.log(`\n[vendor] build: ${dir}`)
    console.log(`[vendor] document chunks: ${boot.documentChunks.join(', ')}`)
    console.log(`[vendor] first-paint roots: ${boot.matchedRoots.join(', ')}`)
    for (const prefix of FIRST_PAINT_ROOT_PREFIXES) {
      if (!boot.unmatchedRoots.includes(prefix)) continue
      failed = true
      console.log(`[vendor]   FAIL: no chunk named "${prefix}*" exists — the first-paint graph is understated (update FIRST_PAINT_ROOT_PREFIXES in scripts/lib/boot-graph.mjs)`)
    }
    // No dynamic edge means the regexes stopped matching what the bundler writes, and every lazy
    // library would then be reported as a leak — the loud direction, but still a broken ruler.
    if (build.dynamicEdges === 0) {
      failed = true
      console.log(`[vendor]   FAIL: no dynamic import edge found across ${build.files.length} chunks; scripts/lib/boot-graph.mjs no longer matches this build`)
      continue
    }
    const bootList = [...boot.chunks].sort()
    console.log(`[vendor] first-paint closure: ${bootList.length} chunks, ${(boot.bytes / 1024).toFixed(1)} KiB`)
    for (const feature of HEAVY_VENDORS) {
      const hits = build.files.filter((file) => feature.needles.some((n) => build.contents.get(file).includes(n)))
      const onBoot = hits.filter((h) => boot.chunks.has(h))
      for (const h of hits) {
        const kb = (build.sizes.get(h) / 1024).toFixed(1)
        console.log(`[vendor]   ${feature.name}: ${h} (${kb} KiB) ${boot.chunks.has(h) ? 'ON FIRST PAINT' : 'isolated'}`)
      }
      if (hits.length === 0) console.log(`[vendor]   ${feature.name}: not present in browser output (worker-side or tree-shaken)`)
      if (!onBoot.length) continue
      if (KNOWN_IN_BOOT.includes(feature.name)) {
        console.log(`[vendor]   ${feature.name}: ${onBoot.length} chunks on first paint — tracked, see KNOWN_IN_BOOT`)
        continue
      }
      failed = true
      console.log(`[vendor]   FAIL: ${feature.name} leaked into the first-paint graph via ${onBoot.join(', ')}`)
    }
    for (const name of KNOWN_IN_BOOT) {
      const feature = HEAVY_VENDORS.find((f) => f.name === name)
      const still = feature && build.files.some((f) => boot.chunks.has(f) && feature.needles.some((n) => build.contents.get(f).includes(n)))
      if (still) continue
      failed = true
      console.log(`[vendor]   FAIL: ${name} is listed in KNOWN_IN_BOOT but no longer reaches first paint — remove the exemption`)
    }
  }
  if (failed) {
    console.error('[vendor] FAILED: heavy vendor code reached the first-screen bundle')
    process.exit(1)
  }
  console.log('[vendor] OK: no untracked heavy vendor reaches the first-paint graph')
}

main()
