import { describe, expect, it } from 'vitest'
import { DEMO_CREDENTIALS } from '../lib/runtime'
import { createDemoBackend } from './backend'

type DemoBackend = ReturnType<typeof createDemoBackend>

function call(backend: DemoBackend, path: string, init?: RequestInit): Promise<Response> {
  return backend.fetch(new Request(`http://demo.local${path}`, init))
}

describe('demo backend', () => {
  it('serves public endpoints without authentication', async () => {
    const backend = createDemoBackend()
    const site = await call(backend, '/api/site')
    expect(site.status).toBe(200)
    expect(await site.json()).toMatchObject({ name: expect.any(String) })
    const session = await call(backend, '/api/auth/session')
    expect(session.status).toBe(200)
  })

  it('rejects protected endpoints until login, then serves them', async () => {
    const backend = createDemoBackend()
    const before = await call(backend, '/api/notes')
    expect(before.status).toBe(401)

    const login = await call(backend, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: DEMO_CREDENTIALS.username, password: DEMO_CREDENTIALS.password }),
    })
    expect(login.status).toBe(200)

    const after = await call(backend, '/api/notes')
    expect(after.status).toBe(200)
    const body = await after.json()
    expect(body).toMatchObject({ notes: expect.any(Array) })
  })

  it('rejects bad credentials and applies the 404 catch-all after login', async () => {
    const backend = createDemoBackend()
    const bad = await call(backend, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: DEMO_CREDENTIALS.username, password: 'wrong' }),
    })
    expect(bad.status).toBe(401)

    await call(backend, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(DEMO_CREDENTIALS),
    })
    const missing = await call(backend, '/api/does-not-exist')
    expect(missing.status).toBe(404)
  })
})

async function authedBackend(): Promise<DemoBackend> {
  const backend = createDemoBackend()
  await call(backend, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(DEMO_CREDENTIALS),
  })
  return backend
}

describe('demo blog routes read surface', () => {
  it('serves the full hub read surface', async () => {
    const backend = await authedBackend()
    const [stats, posts, folders, tags, categories, comments, settings, analytics] = await Promise.all([
      call(backend, '/api/blog/stats'),
      call(backend, '/api/blog/posts'),
      call(backend, '/api/blog/folders'),
      call(backend, '/api/blog/tags'),
      call(backend, '/api/blog/categories'),
      call(backend, '/api/blog/comments'),
      call(backend, '/api/blog/settings'),
      call(backend, '/api/blog/analytics?range=7d'),
    ])
    for (const response of [stats, posts, folders, tags, categories, comments, settings, analytics]) {
      expect(response.status).toBe(200)
    }
    const statsBody = await stats.json()
    expect(statsBody.stats).toMatchObject({ totalPosts: 4, publishedPosts: 3, draftPosts: 1, pendingComments: 2 })
    const postsBody = await posts.json()
    expect(postsBody.posts).toHaveLength(4)
    const analyticsBody = await analytics.json()
    expect(analyticsBody.analytics).toMatchObject({ range: '7d', timeline: expect.any(Array) })
  })

  it('filters posts by status, tag and search', async () => {
    const backend = await authedBackend()
    const drafts = await (await call(backend, '/api/blog/posts?status=draft')).json()
    expect(drafts.posts).toHaveLength(1)
    expect(drafts.posts[0]).toMatchObject({ title: 'Markdown 速查草稿' })
    const byTag = await (await call(backend, '/api/blog/posts?tag=%E5%A4%87%E4%BB%BD')).json()
    expect(byTag.posts).toHaveLength(1)
    expect(byTag.posts[0]).toMatchObject({ title: '自托管笔记的备份策略' })
    const searched = await (await call(backend, '/api/blog/posts?search=inkstone')).json()
    expect(searched.posts[0]).toMatchObject({ title: '欢迎使用 Inkstone' })
  })
})

describe('demo blog route mutations', () => {
  it('moderates comments in memory', async () => {
    const backend = await authedBackend()
    const approved = await call(backend, '/api/blog/comments/demo-comment-2/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    })
    expect(approved.status).toBe(200)
    const pending = await (await call(backend, '/api/blog/comments?status=pending')).json()
    expect(pending.comments).toHaveLength(1)

    const removed = await call(backend, '/api/blog/comments/demo-comment-1', { method: 'DELETE' })
    expect(removed.status).toBe(200)
    const stats = await (await call(backend, '/api/blog/stats')).json()
    expect(stats.stats.totalComments).toBe(4)
  })

  it('patches settings and reports slug availability', async () => {
    const backend = await authedBackend()
    const patched = await call(backend, '/api/blog/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteName: 'Renamed Blog' }),
    })
    expect(patched.status).toBe(200)
    expect((await patched.json()).settings.siteName).toBe('Renamed Blog')

    const slug = await (await call(backend, '/api/blog/check-slug?slug=welcome')).json()
    expect(slug).toEqual({ available: true })
    const notePost = await (await call(backend, '/api/blog/note-post/demo-note-welcome')).json()
    expect(notePost.post).toMatchObject({ slug: 'welcome-to-inkstone' })
  })
})

const graphJson = (init: RequestInit) => ({ headers: { 'Content-Type': 'application/json' }, ...init })

/** Three notes, one folder and one tag: enough for a filter line to have something to narrow. */
async function seededGraphBackend(): Promise<DemoBackend> {
  const backend = await authedBackend()
  const folder = await (await call(backend, '/api/folders',
    graphJson({ method: 'POST', body: JSON.stringify({ name: 'Reading Room' }) }))).json()
  for (const body of [
    { title: 'Note Alpha', content: 'Tags: #movies\n', folderId: folder.id },
    { title: 'Note Beta', content: 'Tags: #movies\n' },
    { title: 'Note Gamma', content: 'Plain body\n', folderId: folder.id },
  ]) {
    await call(backend, '/api/notes', graphJson({ method: 'POST', body: JSON.stringify(body) }))
  }
  return backend
}

async function graphTitles(backend: DemoBackend, query: string): Promise<string[]> {
  const body = await (await call(backend, `/api/graph?q=${encodeURIComponent(query)}`)).json()
  return body.nodes.map((node: { title: string }) => node.title).sort()
}

describe('demo graph route filter grammar', () => {
  it('keeps only notes whose folder path matches a path: term', async () => {
    const backend = await seededGraphBackend()
    expect(await graphTitles(backend, 'path:"Reading Room" note')).toEqual(['Note Alpha', 'Note Gamma'])
    expect(await graphTitles(backend, 'path:shop note')).toEqual([])
  })

  it('matches tag: exactly and excludes with a leading dash', async () => {
    const backend = await seededGraphBackend()
    expect(await graphTitles(backend, 'tag:movies note')).toEqual(['Note Alpha', 'Note Beta'])
    expect(await graphTitles(backend, 'tag:movie note')).toEqual([])
    expect(await graphTitles(backend, '-tag:movies path:Reading note')).toEqual(['Note Gamma'])
    // A note with no folder has no path to exclude, so the negation keeps it.
    expect(await graphTitles(backend, 'tag:movies -path:Reading note')).toEqual(['Note Beta'])
  })
})

describe('the choices a reader makes about the picture (G-42, G-44)', () => {
  async function createNotes(backend: DemoBackend, bodies: Array<{ title: string, content: string }>): Promise<void> {
    for (const body of bodies) {
      await call(backend, '/api/notes', graphJson({ method: 'POST', body: JSON.stringify(body) }))
    }
  }

  async function noteId(backend: DemoBackend, title: string): Promise<string> {
    const listed = await (await call(backend, '/api/notes')).json()
    return listed.notes.find((note: { title: string }) => note.title === title).id
  }

  it('leaves out the note the reader took out of the graph, like the server does (G-42)', async () => {
    const backend = await seededGraphBackend()
    const beta = await noteId(backend, 'Note Beta')

    const graph = await (await call(backend, `/api/graph?excluded=${beta}`)).json()

    expect(graph.nodes.map((node: { title: string }) => node.title)).not.toContain('Note Beta')
    expect(graph.nodes.length).toBeGreaterThan(0)
  })

  it('walks only the requested side of a link in a local graph, like the server does (G-44)', async () => {
    const backend = await authedBackend()
    await createNotes(backend, [
      { title: 'Direction centre', content: 'Points at [[Direction out]]\n' },
      { title: 'Direction out', content: 'Plain body\n' },
      { title: 'Direction in', content: 'Points at [[Direction centre]]\n' },
    ])
    const centre = await noteId(backend, 'Direction centre')

    const walk = async (direction: string): Promise<string[]> => {
      const graph = await (await call(backend, `/api/graph?mode=local&center=${centre}&depth=1&direction=${direction}`)).json()
      return graph.nodes.map((node: { title: string }) => node.title).sort()
    }

    expect(await walk('outgoing')).toEqual(['Direction centre', 'Direction out'])
    expect(await walk('incoming')).toEqual(['Direction centre', 'Direction in'])
    expect(await walk('both')).toEqual(['Direction centre', 'Direction in', 'Direction out'])
  })
})
