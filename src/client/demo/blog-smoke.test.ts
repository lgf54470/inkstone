import { describe, expect, it } from 'vitest'
import { DEMO_CREDENTIALS } from '../lib/runtime'
import { createDemoBackend } from './backend'

type DemoBackend = ReturnType<typeof createDemoBackend>

function call(backend: DemoBackend, path: string, init?: RequestInit): Promise<Response> {
  return backend.fetch(new Request(`http://demo.local${path}`, init))
}

function json(init: Record<string, unknown>): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init) }
}

interface RouteProbe {
  path: string
  init?: RequestInit
}

// Every /api/blog/* route the client calls via src/client/lib/api/share.ts, with
// representative payloads. Any gap here fails the smoke test instead of surfacing
// as a silent 404 console flood in demo mode.
const CLIENT_ROUTES: RouteProbe[] = [
  { path: '/api/blog/stats' },
  { path: '/api/blog/analytics?range=7d' },
  { path: '/api/blog/analytics?range=7d&excludeBots=true&excludeSelf=true&excludeOwner=true' },
  { path: '/api/blog/settings' },
  { path: '/api/blog/settings', init: { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteName: 'Smoke' }) } },
  { path: '/api/blog/check-slug?slug=smoke-post' },
  { path: '/api/blog/check-slug?slug=welcome-to-inkstone&currentPostId=demo-post-1' },
  { path: '/api/blog/note-post/demo-note-welcome' },
  { path: '/api/blog/posts' },
  { path: '/api/blog/posts?status=draft' },
  { path: '/api/blog/posts?categoryId=demo-cat-guide' },
  { path: '/api/blog/posts?folderId=demo-folder-tech' },
  { path: '/api/blog/posts?tag=%E5%A4%87%E4%BB%BD' },
  { path: '/api/blog/posts?search=markdown&sort=title_asc' },
  {
    path: '/api/blog/posts',
    init: json({ noteId: 'demo-note-smoke', title: 'Smoke Post', slug: 'smoke-post', tags: ['测试'], isPublished: true }),
  },
  { path: '/api/blog/posts/demo-post-2', init: { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPinned: true, excerpt: '改过了' }) } },
  { path: '/api/blog/posts/demo-post-2/sync', init: { method: 'POST' } },
  { path: '/api/blog/posts/batch', init: json({ action: 'publish', postIds: ['demo-post-4'] }) },
  { path: '/api/blog/posts/batch', init: json({ action: 'setCategory', postIds: ['demo-post-2'], categoryId: 'demo-cat-tech' }) },
  { path: '/api/blog/posts/batch', init: json({ action: 'setFolder', postIds: ['demo-post-2'], folderId: null }) },
  { path: '/api/blog/posts/batch', init: json({ action: 'setPinned', postIds: ['demo-post-2'], isPinned: false }) },
  { path: '/api/blog/posts/demo-post-4', init: { method: 'DELETE' } },
  { path: '/api/blog/posts/batch', init: json({ action: 'delete', postIds: ['demo-post-4'] }) },
  { path: '/api/blog/folders' },
  { path: '/api/blog/folders', init: json({ name: '烟雾测试目录', parentId: null }) },
  { path: '/api/blog/folders/demo-folder-tech', init: { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '技术文章改' }) } },
  { path: '/api/blog/folders/demo-folder-essay', init: { method: 'DELETE' } },
  { path: '/api/blog/tags' },
  { path: '/api/blog/tags', init: json({ name: '烟雾测试标签', color: '#10b981' }) },
  { path: '/api/blog/tags/demo-tag-1', init: { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPinned: false }) } },
  { path: '/api/blog/tags/demo-tag-6', init: { method: 'DELETE' } },
  { path: '/api/blog/categories' },
  { path: '/api/blog/categories', init: json({ name: '烟雾分类', color: '#8b5cf6' }) },
  { path: '/api/blog/categories/demo-cat-guide', init: { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: '改' }) } },
  { path: '/api/blog/categories/demo-cat-essay', init: { method: 'DELETE' } },
  { path: '/api/blog/batch-toggle-group', init: json({ type: 'folder', target: 'demo-folder-tech', enabled: false }) },
  { path: '/api/blog/batch-toggle-group', init: json({ type: 'tag', target: '备份', enabled: true }) },
  { path: '/api/blog/comments?status=pending' },
  { path: '/api/blog/comments?postId=demo-post-1&search=obsidian' },
  { path: '/api/blog/comments/demo-comment-2/status', init: { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) } },
  { path: '/api/blog/comments/demo-comment-5', init: { method: 'DELETE' } },
  { path: '/api/blog/comments/batch', init: json({ action: 'spam', commentIds: ['demo-comment-4'] }) },
  { path: '/api/blog/comments/batch', init: json({ action: 'delete', commentIds: ['demo-comment-3'] }) },
  { path: '/api/blog/visits?type=bots', init: { method: 'DELETE' } },
  { path: '/api/blog/visits?type=older_than&days=7', init: { method: 'DELETE' } },
  { path: '/api/blog/visits?type=all', init: { method: 'DELETE' } },
  { path: '/api/blog/visits', init: { method: 'DELETE' } },
]

describe('demo blog route coverage', () => {
  it('answers 2xx for every /api/blog/* route the client calls', async () => {
    const backend = createDemoBackend()
    await call(backend, '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(DEMO_CREDENTIALS) })

    const failures: string[] = []
    for (const probe of CLIENT_ROUTES) {
      const response = await call(backend, probe.path, probe.init)
      if (response.status < 200 || response.status >= 300) {
        failures.push(`${probe.init?.method ?? 'GET'} ${probe.path} -> ${response.status}`)
      }
    }
    expect(failures).toEqual([])
  })

  it('mutations round-trip through in-memory state', async () => {
    const backend = createDemoBackend()
    await call(backend, '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(DEMO_CREDENTIALS) })

    const created = await (await call(backend, '/api/blog/posts', json({ noteId: 'demo-note-roundtrip', title: 'Round Trip', isPublished: true }))).json()
    expect(created).toMatchObject({ ok: true, slug: expect.any(String) })

    const folder = await (await call(backend, '/api/blog/folders', json({ name: '回环目录' }))).json()
    expect(folder).toMatchObject({ id: expect.any(String), name: '回环目录' })

    const tag = await (await call(backend, '/api/blog/tags', json({ name: '回环标签' }))).json()
    expect(tag).toMatchObject({ id: expect.any(String), name: '回环标签' })

    const category = await (await call(backend, '/api/blog/categories', json({ name: '回环分类' }))).json()
    expect(category.category).toMatchObject({ id: expect.any(String), slug: '回环分类' })

    const visits = await (await call(backend, '/api/blog/visits?type=all', { method: 'DELETE' })).json()
    expect(visits).toMatchObject({ ok: true, deleted: expect.any(Number) })

    const posts = await (await call(backend, '/api/blog/posts')).json()
    expect(posts.posts.some((post: { id: string }) => post.id === created.id)).toBe(true)
  })
})