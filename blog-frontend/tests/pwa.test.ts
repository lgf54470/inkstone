import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * FEA-12 的 PWA 面：清单可安装、外壳链上清单、service worker 只做离线兜底（不缓存 API、不缓存
 * 文章页），离线页自己不需要网络。这些文件不进打包，所以用读文件钉住接线，防止某次清理把它们
 * 从 public/ 或 Layout 里带掉。
 */

const root = path.resolve(import.meta.dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')

describe('PWA wiring (FEA-12)', () => {
  it('ships a manifest whose icon files exist', () => {
    const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
      name: string
      start_url: string
      display: string
      theme_color: string
      icons: Array<{ src: string; type: string }>
    }
    expect(manifest.name).toBeTruthy()
    expect(manifest.start_url).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(manifest.icons.length).toBeGreaterThan(0)
    for (const icon of manifest.icons) {
      expect(fs.existsSync(path.join(root, 'public', icon.src.replace(/^\//, '')))).toBe(true)
    }
  })

  it('links the manifest from the shell and registers the worker in production only', () => {
    const layout = read('src/layouts/Layout.astro')
    expect(layout).toContain('rel="manifest"')
    expect(layout).toContain("navigator.serviceWorker.register('/sw.js')")
    expect(layout).toContain('const enableServiceWorker = import.meta.env.PROD')
  })

  it('keeps the worker on offline fallback duty only', () => {
    const sw = read('public/sw.js')
    expect(sw).toContain("const OFFLINE_URL = '/offline'")
    expect(sw).toContain("url.pathname.startsWith('/api/')")
    expect(sw).toContain("request.mode !== 'navigate'")
    expect(sw).toContain('caches.match(OFFLINE_URL)')
    // 动态内容不进缓存：只有离线页被 precache。
    expect(sw).not.toContain('cache.put')
  })

  it('renders an offline page that is served from the cache', () => {
    const offline = read('src/pages/offline.astro')
    expect(offline).toContain("t('offline.title'")
    expect(offline).toContain("t('offline.home'")
  })
})
