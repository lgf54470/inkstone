/**
 * Inkstone Blog 的离线兜底（FEA-12）。
 *
 * 策略刻意最小：页面导航走网络优先，只在断网时回缓存的离线页；API 应答一概不缓存、不改写——
 * 博客的内容以服务端为准，一个缓存过的旧文章页比离线页更糟。静态资源交给浏览器的 HTTP 缓存
 * （Astro 的产物带内容哈希），这里不重复造一层。
 */
const OFFLINE_URL = '/offline'
const CACHE_NAME = 'inkstone-blog-offline-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (request.mode !== 'navigate') return

  event.respondWith(
    fetch(request).catch(() =>
      caches.match(OFFLINE_URL).then((cached) => cached ?? new Response('', { status: 503 })),
    ),
  )
})
