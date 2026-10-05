/**
 * One definition of "what must be on the wire before the first screen can paint", shared by the
 * bundle-budget and vendor-isolation gates.
 *
 * Both gates used to disagree with the user. `check-bundle-budget` seeded its eager graph with the
 * `app-` chunk only, and `check-vendor-isolation` followed only the static edges out of
 * `index.html`. A surface reached through `React.lazy` therefore counted as lazy to both of them —
 * while the shell and the workspace are mounted on the very first render, so their whole static
 * closure is everyone's startup cost. Measured on the 2026-10-05 build: the gates saw 612 KiB, the
 * browser fetches 3 446 KiB raw / 1 064 KiB gzip.
 *
 * The rule encoded here: **a `lazy()` boundary is not laziness if the first render mounts what it
 * hands you.** The eager graph is the document's own chunks plus the static closure of every module
 * named in FIRST_PAINT_ROOT_PREFIXES.
 */
import fs from 'node:fs'
import path from 'node:path'

/**
 * Chunk-name prefixes of the modules mounted on the first render of the signed-in app:
 * `app.tsx` (imported by the entry), `features/shell` (rendered once the session resolves),
 * `features/workspace` (rendered by the shell's own first return).
 *
 * Rolldown derives chunk names from the facade module's file name, so renaming one of those source
 * files has to be reflected here too — `unmatchedRoots` makes that a loud failure instead of a
 * silently shrinking eager graph.
 */
export const FIRST_PAINT_ROOT_PREFIXES = ['app-', 'shell-', 'workspace-']

// Rolldown writes static edges with double quotes (`from"./x.js"`) and dynamic ones with backticks
// (`import(`./x.js`)`). All three quote styles are matched on purpose: the dynamic-edge total is
// used as a self-check, and a regex that quietly stopped matching would report a bundle where
// nothing is lazy — the wrong direction to be wrong in.
const STATIC_EDGE = /(?:from|import)\s*(["'])(\.\/[A-Za-z0-9_.-]+\.js)\1/g
const DYNAMIC_EDGE = /import\s*\(\s*(["'`])(\.\/[A-Za-z0-9_.-]+\.js)\1/g

/**
 * Reads every JS chunk of a built client bundle once.
 * @param {string} assetsDir absolute path to `dist/client/assets`
 */
export function readChunks(assetsDir) {
  const files = []
  const deps = new Map()
  const sizes = new Map()
  const contents = new Map()
  let dynamicEdges = 0
  for (const file of fs.readdirSync(assetsDir)) {
    if (!file.endsWith('.js')) continue
    const text = fs.readFileSync(path.join(assetsDir, file), 'utf8')
    files.push(file)
    contents.set(file, text)
    sizes.set(file, fs.statSync(path.join(assetsDir, file)).size)
    const stat = new Set()
    for (const m of text.matchAll(STATIC_EDGE)) stat.add(m[2].slice(2))
    deps.set(file, stat)
    for (const m of text.matchAll(DYNAMIC_EDGE)) dynamicEdges++
  }
  return { files, deps, sizes, contents, dynamicEdges }
}

/**
 * The transitive static closure of the document's own chunks plus the first-paint roots.
 * @param {{files: string[], deps: Map<string, Set<string>>}} build
 * @param {string} indexHtmlText
 */
export function firstPaintChunks(build, indexHtmlText) {
  const documentChunks = [
    ...[...indexHtmlText.matchAll(/<script[^>]*type="module"[^>]*src="\.?\/(?:assets\/)?([^"]+\.js)"/g)].map((m) => m[1]),
    ...[...indexHtmlText.matchAll(/rel="modulepreload"[^>]*href="\.?\/(?:assets\/)?([^"]+\.js)"/g)].map((m) => m[1]),
  ]
  const matchedRoots = []
  const unmatchedRoots = []
  for (const prefix of FIRST_PAINT_ROOT_PREFIXES) {
    const hits = build.files.filter((file) => file.startsWith(prefix))
    if (hits.length) matchedRoots.push(...hits)
    else unmatchedRoots.push(prefix)
  }
  const chunks = new Set()
  const queue = [...new Set([...documentChunks, ...matchedRoots])]
  while (queue.length) {
    const file = queue.pop()
    if (chunks.has(file) || !build.deps.has(file)) continue
    chunks.add(file)
    for (const dep of build.deps.get(file)) queue.push(dep)
  }
  let bytes = 0
  for (const file of chunks) bytes += build.sizes.get(file) ?? 0
  return { chunks, documentChunks: [...new Set(documentChunks)], matchedRoots, unmatchedRoots, bytes }
}
