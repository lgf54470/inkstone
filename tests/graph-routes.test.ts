import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

import type { D1Database } from '@cloudflare/workers-types'
import type { AppBindings } from '../src/worker/env'
import { searchRoutes } from '../src/worker/routes/search'
import { loadSession } from '../src/worker/middleware/auth'
import { createSession } from '../src/worker/lib/session-store'
import { errorResponse } from '../src/worker/lib/errors'
import { createD1Database as createDb, captureSql, runSql, type D1Shim } from './d1-harness'
import { GRAPH_EDGE_CANDIDATE_LIMIT } from '../src/worker/routes/search/helpers'
import { GRAPH_TAG_EDGE_LIMIT } from '../src/shared/graph-tag-nodes'
import { LIMITS } from '../src/shared/constants'

const NOW = 2_000_000_000_000

// 26-char valid ids ([0-9a-hjkmnp-tv-z]{26}); the graph route validates center/folder formats
function vid(seed: string): string {
  return `a${seed.padStart(25, 'c')}`
}
const LEGACY_COOKIE = 'inkstone_session'

let db: D1Shim

function makeApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.onError((err, c) => errorResponse(c, err))
  app.use('/api/*', loadSession)
  app.route('/api/search', searchRoutes)
  return app
}

async function makeDb(): Promise<void> {
  const { TABLE_STATEMENTS } = await import('../src/worker/db/schema/tables')
  const { INDEX_STATEMENTS } = await import('../src/worker/db/schema/indexes')
  db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
}

async function seedUser(): Promise<string> {
  const id = 'graph-user'
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, role, settings, created_at, last_seen_at)
     VALUES (?1, 'alice', 'x', 'alice', 'Alice', '', 'owner', '{}', ?2, ?2)`,
    id, NOW,
  )
  return id
}

async function seedNote(id: string, userId: string, updatedAt: number, folderId: string | null = null): Promise<void> {
  await runSql(
    db,
    `INSERT INTO notes (id, user_id, folder_id, title, title_key, content, excerpt, rev, word_count, char_count,
       is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?4, '# note', '', 1, 1, 6, 0, 0, 0, 0, 'hash', ?5, ?5)`,
    id, userId, folderId, `Title ${id}`, updatedAt,
  )
}

async function seedNotes(count: number, userId: string, prefix = 'n'): Promise<string[]> {
  const ids = Array.from({ length: count }, (_, index) => vid(`${prefix}${index}`))
  for (const [index, id] of ids.entries()) await seedNote(id, userId, NOW + index)
  return ids
}

async function seedLink(userId: string, source: string, target: string | null): Promise<void> {
  await runSql(
    db,
    `INSERT INTO links (source_note_id, target_note_id, target_key, target_title, user_id)
     VALUES (?1, ?2, ?3, ?3, ?4)`,
    source, target, target ?? 'missing-note', userId,
  )
}

async function signIn(userId: string): Promise<string> {
  return createSession(db as unknown as D1Database, userId)
}

function request(app: Hono<AppBindings>, path: string, token: string): Promise<Response> {
  return app.request(path, { headers: { Cookie: `${LEGACY_COOKIE}=${token}` } },
    { DB: db as unknown as D1Database } as unknown as AppBindings['Bindings'],
    { waitUntil: vi.fn() } as unknown as ExecutionContext)
}

interface GraphNode {
  id: string
  degree: number
  inDegree: number
  outDegree: number
}

describe('graph route degree aggregation (real D1)', () => {
  it('computes degree, in and out degrees once per user without correlated probes', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('1'), userId, NOW + 30)
    await seedNote(vid('2'), userId, NOW + 20)
    await seedNote(vid('3'), userId, NOW + 10)
    await seedLink(userId, vid('1'), vid('2'))
    await seedLink(userId, vid('1'), vid('3'))
    await seedLink(userId, vid('2'), vid('3'))
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, '/api/search/graph', token)
    expect(res.status).toBe(200)
    const body = await res.json()
    const byId = new Map<string, GraphNode>(body.nodes.map((node: GraphNode) => [node.id, node]))
    expect(byId.get(vid('1'))).toMatchObject({ degree: 2, inDegree: 0, outDegree: 2 })
    expect(byId.get(vid('2'))).toMatchObject({ degree: 2, inDegree: 1, outDegree: 1 })
    expect(byId.get(vid('3'))).toMatchObject({ degree: 2, inDegree: 2, outDegree: 0 })
    expect(body.edges).toHaveLength(3)
    expect(body.meta.totalNodes).toBe(3)
  })

  it('orders global nodes by degree descending and keeps unresolved links out of link degrees', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('h'), userId, NOW + 10)
    await seedNote(vid('l'), userId, NOW + 40)
    await seedNote(vid('x'), userId, NOW + 30)
    await seedLink(userId, vid('l'), vid('h'))
    await seedLink(userId, vid('x'), null)
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, '/api/search/graph', token)
    const body = await res.json()
    expect(body.nodes.map((node: GraphNode) => node.id)).toEqual([vid('l'), vid('h'), vid('x')])
    const hub = body.nodes.find((node: GraphNode) => node.id === vid('h'))
    expect(hub).toMatchObject({ degree: 1, inDegree: 1, outDegree: 0 })
  })

  it('answers a library too large to bind in one statement', async () => {
    await makeDb()
    const userId = await seedUser()
    // 60 notes is the smallest page the route accepts and every edge query binds a note id on both
    // sides of its join, so as one statement this is 122 variables — past D1's limit of 100, which
    // the graph used to answer with a 500 instead of a graph.
    const ids = Array.from({ length: 60 }, (_, index) => vid(`b${index}`))
    for (const [index, id] of ids.entries()) await seedNote(id, userId, NOW + index)
    for (const [index, id] of ids.entries()) await seedLink(userId, id, ids[(index + 1) % ids.length])
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, '/api/search/graph?limit=60', token)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.nodes).toHaveLength(60)
    expect(body.edges).toHaveLength(60)
    expect(body.meta.totalNodes).toBe(60)
    // The links that came back are the ones that were seeded, and the degrees still come from the one
    // pre-aggregated pass over links rather than from the chunking.
    const byId = new Map<string, GraphNode>(body.nodes.map((node: GraphNode) => [node.id, node]))
    for (const id of ids) expect(byId.get(id)).toMatchObject({ degree: 2, inDegree: 1, outDegree: 1 })
  })

  it('limits the local graph to the configured depth around the center', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('1'), userId, NOW)
    await seedNote(vid('2'), userId, NOW)
    await seedNote(vid('3'), userId, NOW)
    await seedLink(userId, vid('1'), vid('2'))
    await seedLink(userId, vid('2'), vid('3'))
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, `/api/search/graph?mode=local&center=${vid('1')}&depth=1`, token)
    const body = await res.json()
    expect(body.nodes.map((node: GraphNode) => node.id).sort()).toEqual([vid('1'), vid('2')])
    expect(body.meta.centerId).toBe(vid('1'))
  })

  it('applies folder and tag filters before degree ordering', async () => {
    await makeDb()
    const userId = await seedUser()
    const folder = vid('f')
    await runSql(
      db,
      `INSERT INTO folders (id, user_id, parent_id, name, position, created_at, updated_at, deleted_at)
       VALUES (?1, ?2, NULL, 'Work', 0, ?3, ?3, NULL)`,
      folder, userId, NOW,
    )
    await seedNote(vid('wh'), userId, NOW + 5, folder)
    await seedNote(vid('wl'), userId, NOW + 40, folder)
    await seedNote(vid('on'), userId, NOW + 50, null)
    await seedLink(userId, vid('wl'), vid('wh'))
    await seedLink(userId, vid('on'), vid('wh'))
    await runSql(
      db,
      `INSERT INTO tags (id, user_id, name, created_at) VALUES ('tag-1', ?1, 'work', ?2)`,
      userId, NOW,
    )
    await runSql(db, `INSERT INTO note_tags (note_id, tag_id) VALUES (?1, 'tag-1')`, vid('wh'))
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, `/api/search/graph?folderId=${folder}`, token)
    const body = await res.json()
    expect(body.nodes.map((node: GraphNode) => node.id)).toEqual([vid('wh'), vid('wl')])
    expect(body.nodes[0].degree).toBe(2)

    const tagged = await request(app, '/api/search/graph?tags=work', token)
    const taggedBody = await tagged.json()
    expect(taggedBody.nodes.map((node: GraphNode) => node.id)).toEqual([vid('wh')])
  })

  it('batches link and tag statements into a single db.batch roundtrip', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNotes(45, userId, 'p')
    const token = await signIn(userId)
    const app = makeApp()
    const batchSpy = vi.spyOn(db, 'batch')

    const res = await request(app, '/api/search/graph?limit=50', token)
    expect(res.status).toBe(200)
    // The account's read budget is a batch of its own — one upsert row, the price of counting reads —
    // and the link and tag statements still ride one round trip after it: two chunks of two.
    expect(batchSpy.mock.calls.map(([statements]) => statements.length)).toEqual([1, 4])
    batchSpy.mockRestore()
  })

  it('bounds what one edge statement reads and reports the cut as truncated', async () => {
    await makeDb()
    const userId = await seedUser()
    // The page holds the newest note and the note it links to is archived, so each of these links is
    // read and then dropped instead of edged: the page stays small while one statement's answer does
    // not. One row past what a single statement may read is enough to tell a bounded answer from an
    // unbounded one, and a cut answer from a complete one.
    await seedNote(vid('bomb'), userId, NOW + 100)
    await seedNote(vid('ghost'), userId, NOW)
    await runSql(db, 'UPDATE notes SET is_archived = 1 WHERE id = ?', vid('ghost'))
    await runSql(
      db,
      `INSERT INTO links (source_note_id, target_note_id, target_key, target_title, user_id)
       WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ?1)
       SELECT ?2, ?3, 'key-' || printf('%06d', n), 'Target ' || n, ?4 FROM seq`,
      GRAPH_EDGE_CANDIDATE_LIMIT + 2, vid('bomb'), vid('ghost'), userId,
    )
    const token = await signIn(userId)
    const app = makeApp()
    const batchSpy = vi.spyOn(db, 'batch')

    const res = await request(app, '/api/search/graph?limit=50', token)
    expect(res.status).toBe(200)
    const body = await res.json()
    const statements = await (batchSpy.mock.results[0]!.value as Promise<Array<{ results?: unknown[] }>>)
    const widest = Math.max(...statements.map((statement) => statement.results?.length ?? 0))
    expect(widest).toBeLessThanOrEqual(GRAPH_EDGE_CANDIDATE_LIMIT + 1)
    // The rows past the bound were never read, so the page cannot promise it saw every edge.
    expect(body.meta.truncated).toBe(true)
    batchSpy.mockRestore()
  })

  it('skips COUNT query when result is below limit', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNotes(5, userId, 'under')
    const token = await signIn(userId)
    const app = makeApp()

    const captured = captureSql(db)
    const res = await request(app, '/api/search/graph?limit=50', token)
    expect(res.status).toBe(200)
    expect(captured.some((sql) => sql.includes('COUNT(*)'))).toBe(false)
  })

  it('runs COUNT query when result exceeds limit', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNotes(52, userId, 'over')
    const token = await signIn(userId)
    const app = makeApp()

    const captured = captureSql(db)
    const res = await request(app, '/api/search/graph?limit=50', token)
    expect(res.status).toBe(200)
    expect(captured.some((sql) => sql.includes('COUNT(*)'))).toBe(true)
  })

  it('prevents cycle loops in recursive neighborhood CTE for mutual links', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('cyc1'), userId, NOW)
    await seedNote(vid('cyc2'), userId, NOW)
    await seedLink(userId, vid('cyc1'), vid('cyc2'))
    await seedLink(userId, vid('cyc2'), vid('cyc1'))
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, `/api/search/graph?mode=local&center=${vid('cyc1')}&depth=3`, token)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.nodes.map((n: GraphNode) => n.id).sort()).toEqual([vid('cyc1'), vid('cyc2')])
  })

  it('truncates oversized unresolved note titles in buildGraphEdges', async () => {
    await makeDb()
    const userId = await seedUser()
    const longTitle = 'A'.repeat(1000)
    await seedNote(vid('long'), userId, NOW)
    await runSql(
      db,
      `INSERT INTO links (source_note_id, target_note_id, target_key, target_title, user_id)
       VALUES (?1, NULL, 'long-key', ?2, ?3)`,
      vid('long'), longTitle, userId,
    )
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, '/api/search/graph?includeUnresolved=1', token)
    expect(res.status).toBe(200)
    const body = await res.json()
    const unresolvedNode = body.nodes.find((n: { kind: string }) => n.kind === 'unresolved')
    expect(unresolvedNode).toBeDefined()
    expect(unresolvedNode.title.length).toBe(512)
  })

  it('excludes links to or from archived notes from node degree counts', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('active'), userId, NOW)
    await seedNote(vid('archived'), userId, NOW)
    await runSql(db, 'UPDATE notes SET is_archived = 1 WHERE id = ?', vid('archived'))
    await seedLink(userId, vid('active'), vid('archived'))
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, '/api/search/graph', token)
    expect(res.status).toBe(200)
    const body = await res.json()
    const activeNode = body.nodes.find((n: GraphNode) => n.id === vid('active'))
    expect(activeNode).toMatchObject({ degree: 0, inDegree: 0, outDegree: 0 })
  })
})

interface TopologyNode {
  id: string
  kind: string
  title: string
  degree: number
  inDegree: number
  outDegree: number
}

async function seedTag(userId: string, tagId: string, name: string): Promise<void> {
  await runSql(db, `INSERT INTO tags (id, user_id, name, created_at) VALUES (?1, ?2, ?3, ?4)`, tagId, userId, name, NOW)
}

async function tagNote(noteId: string, tagId: string): Promise<void> {
  await runSql(db, `INSERT INTO note_tags (note_id, tag_id) VALUES (?1, ?2)`, noteId, tagId)
}

async function graphBody(path: string, userId: string): Promise<Record<string, never>> {
  const token = await signIn(userId)
  const res = await request(makeApp(), path, token)
  expect(res.status).toBe(200)
  return await res.json() as Record<string, never>
}

describe('graph route tag nodes (FEAT-03, real D1)', () => {
  it('adds one node per tag that pulls two unlinked notes into one cluster', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('a'), userId, NOW + 3)
    await seedNote(vid('b'), userId, NOW + 2)
    await seedNote(vid('c'), userId, NOW + 1)
    await seedTag(userId, 'tag-1', 'todo')
    await seedTag(userId, 'tag-2', 'later')
    await tagNote(vid('a'), 'tag-1')
    await tagNote(vid('b'), 'tag-1')
    await tagNote(vid('c'), 'tag-2')

    const body = await graphBody('/api/search/graph?tagNodes=1', userId)
    const nodes = body.nodes as TopologyNode[]
    const edges = body.edges as Array<{ source: string, target: string }>
    expect(nodes.find((node) => node.id === 'tag:todo'))
      .toMatchObject({ kind: 'tag', title: 'todo', degree: 2, inDegree: 2, outDegree: 0 })
    expect(edges).toContainEqual({ source: vid('a'), target: 'tag:todo' })
    expect(edges).toContainEqual({ source: vid('b'), target: 'tag:todo' })
    // A tag membership is not a wiki link, so it never moves a note's own link degrees.
    expect(nodes.find((node) => node.id === vid('a'))).toMatchObject({ degree: 0, inDegree: 0, outDegree: 0 })
    expect(body.meta).toMatchObject({ totalNodes: 5, truncated: false })
  })

  it('keeps tags out of the topology until the caller asks for them', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('a'), userId, NOW + 2)
    await seedNote(vid('b'), userId, NOW + 1)
    await seedTag(userId, 'tag-1', 'todo')
    await tagNote(vid('a'), 'tag-1')
    await tagNote(vid('b'), 'tag-1')

    const body = await graphBody('/api/search/graph', userId)
    const nodes = body.nodes as TopologyNode[]
    expect(nodes.some((node) => node.kind === 'tag')).toBe(false)
    expect(body.edges).toHaveLength(0)
    expect(body.meta).toMatchObject({ totalNodes: 2, truncated: false })
  })

  it('merges tag names that differ only by case into a single node', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('a'), userId, NOW + 2)
    await seedNote(vid('b'), userId, NOW + 1)
    await seedTag(userId, 'tag-upper', 'Work')
    await seedTag(userId, 'tag-lower', 'work')
    await tagNote(vid('a'), 'tag-upper')
    await tagNote(vid('b'), 'tag-lower')

    const body = await graphBody('/api/search/graph?tagNodes=1', userId)
    const tagNodes = (body.nodes as TopologyNode[]).filter((node) => node.kind === 'tag')
    expect(tagNodes).toHaveLength(1)
    expect(tagNodes[0]!.title.toLowerCase()).toBe('work')
    expect(tagNodes[0]!.degree).toBe(2)
  })

  it('caps the tag nodes it adds and reports the dropped ones as truncation', async () => {
    await makeDb()
    const userId = await seedUser()
    for (let index = 1; index <= 61; index++) {
      const noteId = vid(`t${index}`)
      await seedNote(noteId, userId, NOW + index)
      await seedTag(userId, `tag-${index}`, `topic-${String(index).padStart(2, '0')}`)
      await tagNote(noteId, `tag-${index}`)
    }

    const body = await graphBody('/api/search/graph?tagNodes=1&limit=600', userId)
    const tagNodes = (body.nodes as TopologyNode[]).filter((node) => node.kind === 'tag')
    const edges = body.edges as Array<{ source: string, target: string }>
    expect(tagNodes).toHaveLength(60)
    expect(tagNodes.some((node) => node.id === 'tag:topic-61')).toBe(false)
    expect(edges).toHaveLength(60)
    expect(edges.length).toBeLessThanOrEqual(GRAPH_TAG_EDGE_LIMIT)
    // 61 notes, 60 tag nodes, and the one tag that did not make the cut still counts as hidden.
    expect(body.meta).toMatchObject({ totalNodes: 122, truncated: true })
  })
})

async function seedFolder(userId: string, folderId: string, name: string, parentId: string | null = null): Promise<void> {
  await runSql(
    db,
    `INSERT INTO folders (id, user_id, parent_id, name, position, created_at, updated_at, deleted_at)
     VALUES (?1, ?2, ?5, ?3, 0, ?4, ?4, NULL)`,
    folderId, userId, name, NOW, parentId,
  )
}

function moveToFolder(noteId: string, folderId: string): Promise<unknown> {
  return runSql(db, 'UPDATE notes SET folder_id = ?1 WHERE id = ?2', folderId, noteId)
}

function nodeIds(body: Record<string, never>): string[] {
  return (body.nodes as TopologyNode[]).map((node) => node.id)
}

describe('graph route filter grammar (FEAT-04, real D1)', () => {
  it('drops the notes carrying an excluded tag and keeps the rest of the graph', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('keep'), userId, NOW + 2)
    await seedNote(vid('drop'), userId, NOW + 1)
    await seedTag(userId, 'tag-project', 'project')
    await seedTag(userId, 'tag-archive', 'archive')
    await tagNote(vid('keep'), 'tag-project')
    await tagNote(vid('drop'), 'tag-project')
    await tagNote(vid('drop'), 'tag-archive')

    const plain = await graphBody('/api/search/graph', userId)
    expect(nodeIds(plain).sort()).toEqual([vid('drop'), vid('keep')].sort())

    const excluded = await graphBody('/api/search/graph?q=-tag:archive', userId)
    expect(nodeIds(excluded)).toEqual([vid('keep')])

    const required = await graphBody('/api/search/graph?q=tag:archive', userId)
    expect(nodeIds(required)).toEqual([vid('drop')])
  })

  it('matches a path term against the folder name and lets folderless notes through a negation', async () => {
    await makeDb()
    const userId = await seedUser()
    const workshop = vid('ws')
    await seedFolder(userId, workshop, 'Work Shop')
    await seedNote(vid('in'), userId, NOW + 3, workshop)
    await seedNote(vid('loose'), userId, NOW + 2, null)

    const required = await graphBody('/api/search/graph?q=path:shop', userId)
    expect(nodeIds(required)).toEqual([vid('in')])

    const excluded = await graphBody('/api/search/graph?q=-path:shop', userId)
    expect(nodeIds(excluded)).toEqual([vid('loose')])
  })

  it('keeps two folders that end with the same word as two places on the path', async () => {
    await makeDb()
    const userId = await seedUser()
    const work = vid('wk'), workNotes = vid('wn'), life = vid('lf'), lifeNotes = vid('lo')
    await seedFolder(userId, work, 'Work')
    await seedFolder(userId, workNotes, 'Notes', work)
    await seedFolder(userId, life, 'Life')
    await seedFolder(userId, lifeNotes, 'Notes', life)
    await seedNote(vid('aa'), userId, NOW + 6, workNotes)
    await seedNote(vid('bb'), userId, NOW + 5, lifeNotes)
    await seedNote(vid('cc'), userId, NOW + 4, work)

    const nested = await graphBody('/api/search/graph?q=path:Work%2FNotes', userId)
    expect(nodeIds(nested)).toEqual([vid('aa')])

    const whole = await graphBody('/api/search/graph', userId)
    const paths = new Map((whole.nodes as Array<{ id: string, folderPath: string | null }>).map((node) => [node.id, node.folderPath]))
    expect(paths.get(vid('aa'))).toBe('Work/Notes')
    expect(paths.get(vid('bb'))).toBe('Life/Notes')
    expect(paths.get(vid('cc'))).toBe('Work')

    const either = await graphBody('/api/search/graph?q=path:Notes', userId)
    expect(nodeIds(either).sort()).toEqual([vid('aa'), vid('bb')].sort())

    const branch = await graphBody('/api/search/graph?q=path:Work', userId)
    expect(nodeIds(branch).sort()).toEqual([vid('aa'), vid('cc')].sort())

    const notWork = await graphBody('/api/search/graph?q=-path:Work', userId)
    expect(nodeIds(notWork).sort()).toEqual([vid('bb')].sort())
  })

  it('applies text and folder terms together in one filter line', async () => {
    await makeDb()
    const userId = await seedUser()
    const work = vid('wk')
    await seedFolder(userId, work, 'Work')
    await seedNote(vid('target'), userId, NOW + 4, work)
    await seedNote(vid('other'), userId, NOW + 3, work)
    await seedNote(vid('loose'), userId, NOW + 2, null)
    await runSql(db, `UPDATE notes SET title = 'Target plan', title_key = 'target plan' WHERE id = ?1`, vid('target'))

    const body = await graphBody('/api/search/graph?q=target%20path:work&limit=50', userId)
    expect(nodeIds(body)).toEqual([vid('target')])
  })

  it('keeps exclusions inside the local neighborhood and inside the count fallback', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('c1'), userId, NOW)
    await seedNote(vid('c2'), userId, NOW)
    await seedNote(vid('c3'), userId, NOW)
    await seedLink(userId, vid('c1'), vid('c2'))
    await seedLink(userId, vid('c1'), vid('c3'))
    await seedTag(userId, 'tag-later', 'later')
    await tagNote(vid('c3'), 'tag-later')

    const local = await graphBody(`/api/search/graph?mode=local&center=${vid('c1')}&depth=1&q=-tag:later`, userId)
    expect(nodeIds(local).sort()).toEqual([vid('c1'), vid('c2')].sort())

    // 55 notes plus the three above, 3 of them moved into the excluded folder: the page keeps 50 of the
    // 55 that are left, and the count the overflow falls back to has to read the folder join too.
    const work = vid('wf')
    await seedFolder(userId, work, 'Depot')
    const ids = await seedNotes(55, userId, 'm')
    for (const id of ids.slice(0, 3)) await moveToFolder(id, work)
    const overflow = await graphBody(`/api/search/graph?q=-path:depot&limit=50`, userId)
    expect(nodeIds(overflow)).toHaveLength(50)
    expect(overflow.meta).toMatchObject({ totalNodes: 55, truncated: true })
    for (const id of ids.slice(0, 3)) expect(nodeIds(overflow)).not.toContain(id)
  })
})

describe('graph read budget (G-03, real D1)', () => {
  it('answers a read with 429 and a retry hint once the account is over budget', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('rb'), userId, NOW)
    // The state a runaway loop leaves behind: the account's read key is locked for a minute.
    await runSql(
      db,
      `INSERT INTO login_attempts (key, fails, last_fail_at, locked_until) VALUES (?1, ?2, ?3, ?4)`,
      `graph-read:${userId}`, 200, Date.now(), Date.now() + 60_000,
    )
    const res = await request(makeApp(), '/api/search/graph', await signIn(userId))

    expect(res.status).toBe(429)
    const body = await res.json() as { error: { code: string; details: { retryAfter: number } } }
    expect(body.error.code).toBe('too_many_attempts')
    expect(body.error.details.retryAfter).toBeGreaterThan(0)
  })

  it('charges an on-budget read to the account, so the budget is what counts reads', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('rc'), userId, NOW)
    const res = await request(makeApp(), '/api/search/graph', await signIn(userId))

    expect(res.status).toBe(200)
    const row = await db.prepare('SELECT fails FROM login_attempts WHERE key = ?')
      .bind(`graph-read:${userId}`)
      .first<{ fails: number }>()
    expect(row).toEqual({ fails: 1 })
  })
})

describe('the node limit the interface can ask for (G-21)', () => {
  it('clamps a requested limit into the bounds the settings offer, whichever way it is off', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('lim'), userId, NOW)

    const high = await graphBody('/api/search/graph?limit=9999', userId)
    expect(high.meta).toMatchObject({ limit: LIMITS.graphNodeLimitMax })
    const low = await graphBody('/api/search/graph?limit=1', userId)
    expect(low.meta).toMatchObject({ limit: LIMITS.graphNodeLimitMin })
    const unset = await graphBody('/api/search/graph', userId)
    expect(unset.meta).toMatchObject({ limit: LIMITS.graphNodeLimitDefault })
  })
})

describe('the two numbers the graph route holds at 50 (F-08)', () => {
  /** One note with `count` links to notes that were never created: `count` ghosts. */
  async function ghosted(userId: string, count: number): Promise<void> {
    await seedNote(vid('hub'), userId, NOW)
    for (let index = 0; index < count; index += 1) {
      await runSql(
        db,
        `INSERT INTO links (source_note_id, target_note_id, target_key, target_title, user_id)
         VALUES (?1, NULL, ?2, ?2, ?3)`,
        vid('hub'), `ghost-${index}`, userId,
      )
    }
  }

  async function ghosts(query: string): Promise<{ count: number, truncated: boolean }> {
    const userId = await seedUser()
    await seedNotes(2, userId, 'plain')
    await ghosted(userId, Number(query.match(/ghosts=(\d+)/)?.[1] ?? 0))
    const body = await graphBody(`/api/search/graph?includeUnresolved=1&${query.replace(/ghosts=\d+&?/, '')}`, userId)
    return {
      count: (body.nodes as Array<{ kind: string }>).filter((node) => node.kind === 'unresolved').length,
      truncated: Boolean(body.meta.truncated),
    }
  }

  it('carries 49 ghosts quietly and the fiftieth with the page called truncated', async () => {
    await makeDb()
    // Three notes exist, and the page was asked for 60, so nothing about the notes is cut here.
    const underTheCap = await ghosts('ghosts=49&limit=60')
    expect(underTheCap.count).toBe(49)
    expect(underTheCap.truncated).toBe(false)

    await makeDb()
    const atTheCap = await ghosts('ghosts=50&limit=60')
    expect(atTheCap.count).toBe(50)
    expect(atTheCap.truncated).toBe(true)
  })

  it('holds exactly 50 of the requested page back for ghosts, and no more', async () => {
    await makeDb()
    // limit 53 leaves 3 note rows: the hub plus the two plain notes fit, so the page is whole.
    const fits = await ghosts('ghosts=1&limit=53')
    expect(fits.truncated).toBe(false)

    await makeDb()
    // limit 52 leaves 2, and the third note is what the held-back 50 cost the reader.
    const oneShort = await ghosts('ghosts=1&limit=52')
    expect(oneShort.truncated).toBe(true)
  })

  it('refuses a filter line one character past the 200 the route allows', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('q'), userId, NOW)
    const token = await signIn(userId)

    const atTheCap = await request(makeApp(), `/api/search/graph?q=${'a'.repeat(200)}`, token)
    expect(atTheCap.status).toBe(200)

    const onePast = await request(makeApp(), `/api/search/graph?q=${'a'.repeat(201)}`, token)
    expect(onePast.status).toBe(400)
  })
})

describe('the direction a local graph follows (G-44)', () => {
  // centre ← incoming, centre → outgoing: the two sides of the centre's neighbourhood.
  async function star(): Promise<string> {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('centre'), userId, NOW + 4)
    await seedNote(vid('inc'), userId, NOW + 3)
    await seedNote(vid('out'), userId, NOW + 2)
    await seedLink(userId, vid('inc'), vid('centre'))
    await seedLink(userId, vid('centre'), vid('out'))
    return userId
  }

  const localPath = (query: string) => `/api/search/graph?mode=local&center=${vid('centre')}${query}`

  it('walks only the notes that link in, when the reader asks for who points here', async () => {
    const userId = await star()

    const body = await graphBody(localPath('&direction=incoming'), userId)

    expect(nodeIds(body).sort()).toEqual([vid('centre'), vid('inc')].sort())
  })

  it('walks only the notes it links to, when the reader asks for where it points', async () => {
    const userId = await star()

    const body = await graphBody(localPath('&direction=outgoing'), userId)

    expect(nodeIds(body).sort()).toEqual([vid('centre'), vid('out')].sort())
  })

  it('walks both ways by default, and an unknown direction does not change the answer', async () => {
    const userId = await star()

    expect(nodeIds(await graphBody(localPath(''), userId)).sort())
      .toEqual([vid('centre'), vid('inc'), vid('out')].sort())
    expect(nodeIds(await graphBody(localPath('&direction=sideways'), userId)).sort())
      .toEqual([vid('centre'), vid('inc'), vid('out')].sort())
  })
})

describe('the note a reader took out of the graph (G-42)', () => {
  it('leaves the excluded note out of the page, and out of the links beside it', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('a'), userId, NOW + 3)
    await seedNote(vid('b'), userId, NOW + 2)
    await seedNote(vid('c'), userId, NOW + 1)
    await seedLink(userId, vid('a'), vid('b'))
    await seedLink(userId, vid('b'), vid('c'))

    const body = await graphBody(`/api/search/graph?excluded=${vid('b')}`, userId)

    expect(nodeIds(body).sort()).toEqual([vid('a'), vid('c')].sort())
    const edges = body.edges as Array<{ source: string, target: string }>
    expect(edges.some((edge) => edge.source === vid('b') || edge.target === vid('b'))).toBe(false)
  })

  it('keeps the folder and tag filters beside an exclusion instead of replacing them', async () => {
    await makeDb()
    const userId = await seedUser()
    // Ids the route accepts are Crockford base-32, so these seeds avoid the letters it excludes.
    const work = vid('t')
    await seedFolder(userId, work, 'Work')
    await seedNote(vid('u'), userId, NOW + 4, work)
    await seedNote(vid('v'), userId, NOW + 3)
    await seedNote(vid('w'), userId, NOW + 2, work)
    await seedTag(userId, 'tag-todo', 'todo')
    await tagNote(vid('u'), 'tag-todo')
    await tagNote(vid('w'), 'tag-todo')

    const body = await graphBody(
      `/api/search/graph?folderId=${work}&tags=todo&excluded=${vid('w')}`,
      userId,
    )

    expect(nodeIds(body)).toEqual([vid('u')])
  })

  it('ignores an excluded id that is not a note id rather than refusing the graph', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('a'), userId, NOW + 2)
    await seedNote(vid('b'), userId, NOW + 1)

    // A preference can outlive a note, and a stale entry has to be dropped, not answered 400.
    const body = await graphBody(`/api/search/graph?excluded=not-an-id%2C${vid('b')}`, userId)

    expect(nodeIds(body).sort()).toEqual([vid('a')].sort())
  })

  it('keeps the centre of a local graph even when that note is taken out', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('centre'), userId, NOW + 2)
    await seedNote(vid('neigh'), userId, NOW + 1)
    await seedLink(userId, vid('centre'), vid('neigh'))

    // The local graph is built around the note the reader is standing on. Taking that note out of the
    // global picture must not answer their own note's neighbourhood with an empty canvas.
    const body = await graphBody(`/api/search/graph?mode=local&center=${vid('centre')}&excluded=${vid('centre')}`, userId)

    expect(nodeIds(body)).toContain(vid('centre'))
  })

  it('carries a full page of exclusions in one statement, and takes no more than that', async () => {
    await makeDb()
    const userId = await seedUser()
    const ids = await seedNotes(LIMITS.graphExcludedMax, userId, 'ex')
    await seedNote(vid('kept'), userId, NOW + 2)
    // One note past the cap: the list is what the route refuses to carry further, not the graph.
    const past = vid('z')
    await seedNote(past, userId, NOW + 1)

    const atTheCap = await graphBody(`/api/search/graph?excluded=${ids.join(',')}`, userId)
    expect(nodeIds(atTheCap).sort()).toEqual([vid('kept'), past].sort())

    const overTheCap = await graphBody(`/api/search/graph?excluded=${[...ids, past].join(',')}`, userId)
    expect(nodeIds(overTheCap).sort()).toEqual([vid('kept'), past].sort())
  })
})
