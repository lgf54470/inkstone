import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const rootFile = (path: string) => fileURLToPath(new URL(path, import.meta.url))

const CORE_PUBLIC_ASSETS = [
  'apple-touch-icon.png',
  'inkstone-logo.svg',
  'manifest.webmanifest',
  'pwa-192x192.png',
  'pwa-512x512.png',
  'pwa-maskable-512x512.png',
] as const

const OPTIONAL_PUBLIC_ASSETS = [
  'inkstone-markdown-demo.svg',
] as const

const PUBLIC_ASSETS = [...CORE_PUBLIC_ASSETS, ...OPTIONAL_PUBLIC_ASSETS] as const

const CORE_LAZY_MODULES = [
  '/src/client/App.tsx',
  '/src/client/features/shell/AppShell.tsx',
  '/src/client/features/workspace/Workspace.tsx',
  '/src/shared/locales/en-US.ts',
  '/src/shared/locales/zh-CN.ts',
] as const

// Cap for the per-track offline audio cache inside the service worker: when a
// new save would cross it, the oldest-saved tracks are evicted first.
const OFFLINE_AUDIO_BUDGET_BYTES = 200 * 1024 * 1024

type BuildChunk = {
  type: 'chunk'
  fileName: string
  code: string
  isEntry: boolean
  imports: string[]
  facadeModuleId: string | null
  viteMetadata?: {
    importedCss?: Set<string>
  }
}

type BuildAsset = {
  type: 'asset'
  fileName: string
  source: string | Uint8Array
}

type BuildBundle = Record<string, BuildChunk | BuildAsset>

export function inkstonePwa(): Plugin {
  return {
    name: 'inkstone:pwa',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    generateBundle(_options, bundle) {
      const bundleFiles = Object.values(bundle)
        .map((entry) => entry.fileName)
        .filter((fileName) => !fileName.endsWith('.map'))
      const allFiles = [...new Set([
        'index.html',
        ...bundleFiles,
        ...PUBLIC_ASSETS,
      ])].sort()
      const coreFiles = collectCoreFiles(bundle as BuildBundle)

      const hash = createHash('sha256')
      for (const entry of Object.values(bundle).sort((left, right) =>
        left.fileName.localeCompare(right.fileName))) {
        hash.update(entry.fileName)
        hash.update(entry.type === 'chunk' ? entry.code : entry.source)
      }
      for (const fileName of PUBLIC_ASSETS) {
        hash.update(fileName)
        hash.update(readFileSync(rootFile(`./public/${fileName}`)))
      }
      const buildId = hash.digest('hex').slice(0, 16)

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorkerSource(
          buildId,
          coreFiles.map((fileName) => `/${fileName}`),
          allFiles.map((fileName) => `/${fileName}`),
        ),
      })
    },
  }
}

function collectCoreFiles(bundle: BuildBundle): string[] {
  const files = new Set<string>(['index.html', ...CORE_PUBLIC_ASSETS])
  const matchedCoreLazy = new Set<string>()
  const pending = Object.values(bundle)
    .filter((entry): entry is BuildChunk => {
      if (entry.type !== 'chunk') return false
      if (entry.isEntry) return true
      const matched = isCoreLazyChunk(entry)
      if (matched) {
        const moduleId = entry.facadeModuleId?.replaceAll('\\', '/')
        for (const suffix of CORE_LAZY_MODULES) {
          if (moduleId?.endsWith(suffix)) {
            matchedCoreLazy.add(suffix)
          }
        }
      }
      return matched
    })

  for (const suffix of CORE_LAZY_MODULES) {
    if (!matchedCoreLazy.has(suffix)) {
      console.warn(`[inkstone:pwa] Warning: core lazy module '${suffix}' was not matched in build chunks`)
    }
  }

  while (pending.length) {
    const chunk = pending.pop()!
    if (files.has(chunk.fileName)) continue
    files.add(chunk.fileName)
    for (const style of chunk.viteMetadata?.importedCss ?? []) files.add(style)
    for (const imported of chunk.imports) {
      const dependency = bundle[imported]
      if (dependency?.type === 'chunk') pending.push(dependency)
    }
  }

  const index = bundle['index.html']
  if (index?.type === 'asset') {
    const html = typeof index.source === 'string'
      ? index.source
      : new TextDecoder().decode(index.source)
    for (const match of html.matchAll(/(?:src|href)=["']\/?([^"'#?]+)["']/g)) {
      const fileName = match[1]
      if (fileName && (bundle[fileName] || CORE_PUBLIC_ASSETS.includes(fileName as never))) {
        files.add(fileName)
      }
    }
  }

  return [...files].sort()
}

function isCoreLazyChunk(chunk: BuildChunk): boolean {
  const moduleId = chunk.facadeModuleId?.replaceAll('\\', '/')
  return Boolean(moduleId && CORE_LAZY_MODULES.some((suffix) => moduleId.endsWith(suffix)))
}

export function serviceWorkerSource(
  buildId: string,
  coreUrls: string[],
  allUrls: string[],
  audioBudgetBytes: number = OFFLINE_AUDIO_BUDGET_BYTES,
): string {
	return `const BUILD_ID = ${JSON.stringify(buildId)}
	const SHELL_CACHE = ${JSON.stringify(`inkstone-shell-${buildId}`)}
	const ASSET_CACHE = 'inkstone-assets-v1'
	const CORE_URLS = ${JSON.stringify(coreUrls)}
	const ALL_OFFLINE_URLS = ${JSON.stringify(allUrls)}
	const OPTIONAL_URLS = ALL_OFFLINE_URLS.filter((url) => !CORE_URLS.includes(url))
	const OPTIONAL_URL_SET = new Set(OPTIONAL_URLS)
	const CACHE_META_URL = '/.inkstone-cache-meta'
	const MANIFEST_META_PREFIX = '/.inkstone-offline-manifest/'
	const CURRENT_MANIFEST_URL = MANIFEST_META_PREFIX + BUILD_ID
	const NETWORK_ONLY_EXACT_PATHS = ['/authorize', '/mcp']
	const NETWORK_ONLY_PATH_PREFIXES = ['/api/', '/authorize/', '/mcp/', '/oauth/', '/.well-known/']
	const AUDIO_CACHE = 'inkstone-audio-v1'
	const AUDIO_META_HEADER = 'x-inkstone-audio-meta'
	const AUDIO_STREAM_PATTERN = /^\\/api\\/music\\/tracks\\/[^/]+\\/stream$/
	const AUDIO_BUDGET_BYTES = ${audioBudgetBytes}
	let warmPromise = null

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const previousShells = (await caches.keys()).filter((key) =>
      key.startsWith('inkstone-shell-') && key !== SHELL_CACHE)
    await cacheCoreResources()
    if (previousShells.length) await warmOfflineCache(false)
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }
  if (event.data?.type === 'GET_OFFLINE_CACHE_STATUS') {
    event.waitUntil(reportOfflineStatus(event.source))
    return
  }
  if (event.data?.type === 'WARM_OFFLINE_CACHE') {
    event.waitUntil(warmOfflineCache(false))
    return
  }
  if (event.data?.type === 'LIST_OFFLINE_AUDIO') {
    event.waitUntil(listOfflineAudio().then((tracks) => {
      event.source?.postMessage({ type: 'OFFLINE_AUDIO_LIST', requestId: event.data.requestId, tracks })
    }))
    return
  }
  if (event.data?.type === 'STORE_OFFLINE_AUDIO') {
    event.waitUntil(storeOfflineAudio(event.source, event.data))
    return
  }
  if (event.data?.type === 'REMOVE_OFFLINE_AUDIO') {
    event.waitUntil(removeOfflineAudio(event.source, event.data))
    return
  }
  if (event.data?.type === 'CLEAR_OFFLINE_AUDIO') {
    event.waitUntil(clearOfflineAudio(event.source, event.data))
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys
      .filter((key) => key.startsWith('inkstone-shell-') && key !== SHELL_CACHE)
      .map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Music streams stay network-only while online; the cache below only speaks
  // up once the network is gone, so auth, expiry and range semantics are untouched.
  if (url.origin === self.location.origin && AUDIO_STREAM_PATTERN.test(url.pathname)) {
    event.respondWith(handleAudioStream(request, url.pathname))
    return
  }
	  if (
	    url.origin !== self.location.origin ||
	    NETWORK_ONLY_EXACT_PATHS.includes(url.pathname) ||
	    NETWORK_ONLY_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
	  ) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const shell = await caches.open(SHELL_CACHE)
        const cached = await shell.match('/index.html')
        return cached || Response.error()
      }),
    )
    return
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true })
    if (cached) return cached
    const response = await fetch(request)
    if (response.ok && OPTIONAL_URL_SET.has(url.pathname)) {
      const assets = await caches.open(ASSET_CACHE)
      await assets.put(url.pathname, response.clone())
    }
    return response
  })())
})

async function handleAudioStream(request, pathname) {
  const network = await fetch(request).catch(() => null)
  if (network) return network
  const cache = await caches.open(AUDIO_CACHE)
  const cached = await cache.match(pathname)
  if (!cached) return Response.error()
  const rangeHeader = request.headers.get('Range')
  if (!rangeHeader) return cached
  return sliceCachedAudio(cached, rangeHeader)
}

async function sliceCachedAudio(cached, rangeHeader) {
  const body = await cached.arrayBuffer()
  const total = body.byteLength
  const match = /^bytes=(\\d*)-(\\d*)$/.exec(rangeHeader.trim())
  if (!match) return new Response(body, audioServedHeaders(cached, null))
  let start
  let end
  if (match[1] === '') {
    const suffix = Number(match[2])
    if (!suffix) return rangeNotSatisfiable(total)
    start = Math.max(0, total - suffix)
    end = total - 1
  } else {
    start = Number(match[1])
    end = match[2] === '' ? total - 1 : Math.min(Number(match[2]), total - 1)
    if (!Number.isFinite(start) || start >= total || start > end) return rangeNotSatisfiable(total)
  }
  const headers = audioServedHeaders(cached, 'bytes ' + start + '-' + end + '/' + total)
  return new Response(body.slice(start, end + 1), { status: 206, headers })
}

function audioServedHeaders(cached, contentRange) {
  const headers = {
    'Content-Type': cached.headers.get('Content-Type') || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
  }
  if (contentRange) headers['Content-Range'] = contentRange
  return headers
}

function rangeNotSatisfiable(total) {
  return new Response(null, {
    status: 416,
    headers: { 'Content-Range': 'bytes */' + total, 'Accept-Ranges': 'bytes' },
  })
}

function audioMeta(response) {
  try {
    const meta = JSON.parse(response.headers.get(AUDIO_META_HEADER) || 'null')
    return { sizeBytes: Number(meta.sizeBytes) || 0, addedAt: Number(meta.addedAt) || 0 }
  } catch {
    // Corrupt or missing meta only costs the eviction ordering for this one
    // entry; treating it as an unknown-age zero-byte file keeps it droppable.
    return { sizeBytes: 0, addedAt: 0 }
  }
}

async function listOfflineAudio() {
  const cache = await caches.open(AUDIO_CACHE)
  const tracks = []
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname
    if (!AUDIO_STREAM_PATTERN.test(path)) continue
    const response = await cache.match(request)
    if (!response) continue
    tracks.push({ path, sizeBytes: audioMeta(response).sizeBytes })
  }
  return tracks
}

async function storeOfflineAudio(source, data) {
  const reply = (ok, reason) => source?.postMessage({
    type: 'OFFLINE_AUDIO_STORED', requestId: data.requestId, ok, reason,
  })
  const path = String(data.path || '')
  const blob = data.blob
  if (!AUDIO_STREAM_PATTERN.test(path) || !(blob instanceof Blob) || !blob.size) {
    await reply(false, 'invalid')
    return
  }
  const cache = await caches.open(AUDIO_CACHE)
  // Re-storing a path replaces its entry, so its old bytes do not count
  // against the budget and it is never an eviction candidate.
  const entries = (await listOfflineAudioWithAge()).filter((entry) => entry.path !== path)
  let used = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0)
  const doomed = []
  for (const entry of entries.sort((left, right) => left.addedAt - right.addedAt)) {
    if (used + blob.size <= AUDIO_BUDGET_BYTES) break
    doomed.push(entry)
    used -= entry.sizeBytes
  }
  if (used + blob.size > AUDIO_BUDGET_BYTES) {
    // A single track larger than the whole budget is refused before a single
    // existing copy gets deleted.
    await reply(false, 'quota')
    return
  }
  for (const entry of doomed) await cache.delete(entry.path)
  try {
    await cache.put(path, new Response(blob, { headers: {
      'Content-Type': String(data.mime || 'application/octet-stream'),
      [AUDIO_META_HEADER]: JSON.stringify({ sizeBytes: blob.size, addedAt: Date.now() }),
    } }))
  } catch {
    // Storage failures (disk full, quota enforced by the browser) surface to the
    // page as a rejected save so the user sees the toast instead of silence.
    await reply(false, 'error')
    return
  }
  await reply(true, null)
}

async function listOfflineAudioWithAge() {
  const cache = await caches.open(AUDIO_CACHE)
  const entries = []
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname
    if (!AUDIO_STREAM_PATTERN.test(path)) continue
    const response = await cache.match(request)
    if (!response) continue
    entries.push({ path, request, ...audioMeta(response) })
  }
  return entries
}

async function removeOfflineAudio(source, data) {
  const path = String(data.path || '')
  let ok = false
  if (AUDIO_STREAM_PATTERN.test(path)) {
    const cache = await caches.open(AUDIO_CACHE)
    ok = await cache.delete(path)
  }
  source?.postMessage({ type: 'OFFLINE_AUDIO_REMOVED', requestId: data.requestId, ok })
}

async function clearOfflineAudio(source, data) {
  await caches.delete(AUDIO_CACHE)
  source?.postMessage({ type: 'OFFLINE_AUDIO_CLEARED', requestId: data.requestId, ok: true })
}

async function cacheCoreResources() {
  const shell = await caches.open(SHELL_CACHE)
  await forEachConcurrent(CORE_URLS, 4, async (url) => {
    if (await shell.match(url)) return
    let response = null
    if (isImmutableAsset(url)) response = await caches.match(url, { ignoreSearch: true })
    if (!response) response = await fetchRequired(url)
    await shell.put(url, response.clone())
  })
  await shell.put(CACHE_META_URL, new Response(String(Date.now())))
}

function warmOfflineCache(notifyWhenComplete) {
  if (!warmPromise) {
    warmPromise = runOfflineWarmup(notifyWhenComplete).finally(() => {
      warmPromise = null
    })
  }
  return warmPromise
}

async function runOfflineWarmup(notifyWhenComplete) {
  const assets = await caches.open(ASSET_CACHE)
  if (await assets.match(CURRENT_MANIFEST_URL)) {
    await broadcastStatus('ready', ALL_OFFLINE_URLS.length, ALL_OFFLINE_URLS.length, false)
    return
  }
  let completed = await countAvailable()
  let processed = 0
  await broadcastStatus('preparing', completed, ALL_OFFLINE_URLS.length, false)

  try {
    // Fill the complete offline cache quietly after the app is ready. A single
    // request at a time plus a short yield keeps foreground traffic responsive.
    await forEachConcurrent(OPTIONAL_URLS, 1, async (url) => {
      if (isImmutableAsset(url) && await assets.match(url)) return
      const reused = isImmutableAsset(url)
        ? await caches.match(url, { ignoreSearch: true })
        : null
      const response = reused || await fetchRequired(url)
      await assets.put(url, response.clone())
      if (!reused) completed++
      processed++
      if (processed % 8 === 0) {
        await broadcastStatus('preparing', completed, ALL_OFFLINE_URLS.length, false)
      }
      await pauseBackgroundWarmup()
    })
    await writeCurrentManifest(assets)
    await pruneAssetCache(assets)
    await broadcastStatus('ready', ALL_OFFLINE_URLS.length, ALL_OFFLINE_URLS.length, notifyWhenComplete)
  } catch (error) {
    await broadcastStatus('error', await countAvailable(), ALL_OFFLINE_URLS.length, false)
    throw error
  }
}

async function reportOfflineStatus(target) {
  const assets = await caches.open(ASSET_CACHE)
  const complete = Boolean(await assets.match(CURRENT_MANIFEST_URL))
  const completed = complete ? ALL_OFFLINE_URLS.length : await countAvailable()
  const message = statusMessage(complete ? 'ready' : 'preparing', completed, ALL_OFFLINE_URLS.length, false)
  if (target && 'postMessage' in target) target.postMessage(message)
  else await broadcast(message)
}

async function countAvailable() {
  let count = 0
  await forEachConcurrent(ALL_OFFLINE_URLS, 8, async (url) => {
    if (await caches.match(url, { ignoreSearch: true })) count++
  })
  return count
}

async function writeCurrentManifest(cache) {
  await cache.put(CURRENT_MANIFEST_URL, new Response(JSON.stringify({
    buildId: BUILD_ID,
    createdAt: Date.now(),
    urls: OPTIONAL_URLS,
  }), { headers: { 'Content-Type': 'application/json' } }))
}

async function pruneAssetCache(cache) {
  const keys = await cache.keys()
  const manifests = []
  for (const request of keys) {
    const path = new URL(request.url).pathname
    if (!path.startsWith(MANIFEST_META_PREFIX)) continue
    try {
      const value = await (await cache.match(request)).json()
      if (Array.isArray(value.urls)) manifests.push(value)
    } catch {
      // Best-effort manifest read: a corrupt entry is skipped so one bad
      // manifest cannot break the whole prune sweep.
    }
  }
  manifests.sort((left, right) => Number(right.createdAt) - Number(left.createdAt))
  const retained = manifests.slice(0, 2)
  const retainedUrls = new Set(retained.flatMap((manifest) => manifest.urls))
  const retainedBuilds = new Set(retained.map((manifest) => manifest.buildId))

  await Promise.all(keys.map(async (request) => {
    const path = new URL(request.url).pathname
    if (path.startsWith(MANIFEST_META_PREFIX)) {
      const id = path.slice(MANIFEST_META_PREFIX.length)
      if (!retainedBuilds.has(id)) await cache.delete(request)
      return
    }
    if (!retainedUrls.has(path)) await cache.delete(request)
  }))
}

async function fetchRequired(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to cache ' + url + ': HTTP ' + response.status)
  return response
}

function pauseBackgroundWarmup() {
  return new Promise((resolve) => setTimeout(resolve, 75))
}

function isImmutableAsset(url) {
  return url.startsWith('/assets/')
}

async function forEachConcurrent(values, concurrency, work) {
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++
      await work(values[index])
    }
  })
  await Promise.all(workers)
}

function statusMessage(status, completed, total, notify) {
  return { type: 'OFFLINE_CACHE_STATUS', buildId: BUILD_ID, status, completed, total, notify }
}

async function broadcastStatus(status, completed, total, notify) {
  await broadcast(statusMessage(status, completed, total, notify))
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of clients) client.postMessage(message)
}
`
}
