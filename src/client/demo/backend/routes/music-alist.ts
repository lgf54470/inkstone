import { Hono, type Context } from 'hono'
import type { MusicTrack } from '@shared/types'
import type { DemoState } from '../../state'
import { newDemoId } from '../../state'
import { apiError, jsonBody } from '../helpers/info'

// FEA-A3 demo stub: the demo cannot leave the machine, so the "upstream Alist" is
// an in-memory tree and the config store lives beside it. The contract — token
// never echoed, reference rows outside the quota, paths under the root — is what
// the stub pins down.
interface DemoAlistServer {
  id: string
  name: string
  url: string
  rootPath: string
  token: string
  tree: DemoAlistNode
}

interface DemoAlistNode {
  name: string
  isDir: boolean
  size: number
  children?: DemoAlistNode[]
}

function demoTree(): DemoAlistNode {
  return {
    name: 'media', isDir: true, size: 0, children: [
      { name: 'ambient-one.mp3', isDir: false, size: 4096 },
      { name: 'ambient-two.flac', isDir: false, size: 8192 },
      { name: 'sessions', isDir: true, size: 0, children: [
        { name: 'live-take.mp3', isDir: false, size: 2048 },
      ] },
    ],
  }
}

function nodeAt(root: DemoAlistNode, path: string): DemoAlistNode | null {
  let node: DemoAlistNode = root
  for (const segment of path.split('/').filter(Boolean)) {
    const next = node.children?.find((child) => child.name === segment)
    if (!next) return null
    node = next
  }
  return node
}

function joinRoot(root: string, sub: string): string {
  if (sub === '/') return root || '/'
  return `${root.replace(/\/+$/, '')}/${sub.replace(/^\/+/, '')}`
}

function serverView(server: DemoAlistServer): { id: string; name: string; url: string; rootPath: string } {
  return { id: server.id, name: server.name, url: server.url, rootPath: server.rootPath }
}

async function listServersHandler(c: Context, state: DemoState): Promise<Response> {
  return c.json({ servers: [...state.musicAlistServers.values()].map(serverView) })
}

async function createHandler(c: Context, state: DemoState): Promise<Response> {
  const body = await jsonBody(c.req.raw)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  const token = typeof body.token === 'string' ? body.token : ''
  if (!name || !url || !token || !/^https?:\/\//.test(url)) {
    return apiError(400, 'bad_request', 'Provide a name, an http(s) URL and a token')
  }
  const server: DemoAlistServer = {
    id: newDemoId(),
    name,
    url,
    rootPath: typeof body.rootPath === 'string' && body.rootPath ? body.rootPath : '/',
    token,
    tree: demoTree(),
  }
  state.musicAlistServers.set(server.id, server)
  return c.json(serverView(server), 201)
}

async function patchHandler(c: Context, state: DemoState): Promise<Response> {
  const server = state.musicAlistServers.get(c.req.param('id') ?? '')
  if (!server) return apiError(404, 'not_found', 'Alist server not found')
  return c.json(serverView(server))
}

async function deleteHandler(c: Context, state: DemoState): Promise<Response> {
  if (!state.musicAlistServers.delete(c.req.param('id') ?? '')) return apiError(404, 'not_found', 'Alist server not found')
  return c.json({ ok: true as const })
}

async function listHandler(c: Context, state: DemoState): Promise<Response> {
  const server = state.musicAlistServers.get(c.req.param('id') ?? '')
  if (!server) return apiError(404, 'not_found', 'Alist server not found')
  const subPath = decodeURIComponent(c.req.query('path') ?? '/')
  const node = nodeAt(server.tree, subPath)
  if (!node || !node.isDir) return apiError(404, 'not_found', 'Directory not found')
  const entries = (node.children ?? []).map((child) => ({
    name: child.name,
    isDir: child.isDir,
    size: child.size,
    path: joinRoot(subPath, child.name),
  }))
  return c.json({ path: subPath, entries })
}

async function importHandler(c: Context, state: DemoState): Promise<Response> {
  const server = state.musicAlistServers.get(c.req.param('id') ?? '')
  if (!server) return apiError(404, 'not_found', 'Alist server not found')
  const body = await jsonBody(c.req.raw)
  const path = typeof body.path === 'string' ? body.path : ''
  const node = nodeAt(server.tree, path)
  if (!node || node.isDir) return apiError(404, 'not_found', 'File not found')
  if (!/\.(mp3|flac|m4a|wav|ogg|opus|aac)$/i.test(node.name)) {
    return apiError(400, 'bad_request', 'Unsupported media format')
  }
  const now = Date.now()
  const track: MusicTrack = {
    id: newDemoId(),
    title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : node.name.replace(/\.[^.]+$/, ''),
    artist: typeof body.artist === 'string' ? body.artist.trim() : '',
    album: '',
    durationMs: 0,
    source: 'alist',
    format: node.name.toLowerCase().endsWith('.flac') ? 'flac' : 'mp3',
    webdavPath: null,
    mime: node.name.toLowerCase().endsWith('.flac') ? 'audio/flac' : 'audio/mpeg',
    sizeBytes: node.size,
    coverUrl: null,
    lyric: null,
    hasLyric: false,
    tagIds: [],
    isFavorite: false,
    isPinned: false,
    playCount: 0,
    lastPlayedAt: null,
    contentHash: null,
    createdAt: now,
    updatedAt: now,
  }
  state.musicTracks.set(track.id, { track, file: new File([new Uint8Array(node.size)], node.name) })
  return c.json(track, 201)
}

export function registerDemoMusicAlistRoutes(app: Hono, state: DemoState): void {
  app.get('/api/music/alist', (c) => listServersHandler(c, state))
  app.post('/api/music/alist', (c) => createHandler(c, state))
  app.patch('/api/music/alist/:id', (c) => patchHandler(c, state))
  app.delete('/api/music/alist/:id', (c) => deleteHandler(c, state))
  app.get('/api/music/alist/:id/list', (c) => listHandler(c, state))
  app.post('/api/music/alist/:id/import', (c) => importHandler(c, state))
}
