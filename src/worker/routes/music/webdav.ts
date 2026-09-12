import { mergeSettings } from '@shared/constants'
import { normalizeMusicDir } from '@shared/music-path'
import type { MusicWebdavEntry, WebdavConfig } from '@shared/types'
import type { AppBindings } from '../../env'
import { decryptSecret } from '../../lib/crypto'
import { ApiError } from '../../lib/errors'
import { authHeader, baseUrl, childUrl, ensureDirs, webdavFetch, type WebdavSecret } from '../../backup/webdav'
import { readResponseBytesWithinLimit } from '../../backup/common'
import { cancelStreamBestEffort } from '../../lib/streams'
import { decodeHrefPath, isAudioEntry, parseMultistatus } from './webdav-xml'

const PROPFIND_MAX_BYTES = 512 * 1024
const PROPFIND_DEPTH = '1'

export interface MusicWebdavContext {
  config: WebdavConfig
  secret: WebdavSecret
  dir: string
  base: URL
  auth: string
}

interface BackupTargetRow {
  id: string
  type: string
  name: string
  enabled: number
  config: string
  secret: string | null
}

interface SettingsOwner {
  settingsRaw: string
}

function parseTargetConfig(raw: string): WebdavConfig {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as WebdavConfig
  } catch (error) {
    console.warn('[inkstone] music webdav target config is unreadable:', error)
  }
  return { url: '', username: '', prefix: '', mode: 'archive' }
}

async function loadTargetRow(
  env: AppBindings['Bindings'],
  userId: string,
  targetId: string | null,
): Promise<BackupTargetRow | null> {
  if (targetId) {
    return env.DB.prepare(`SELECT id, type, name, enabled, config, secret FROM backup_targets WHERE id = ?1 AND user_id = ?2`)
      .bind(targetId, userId).first<BackupTargetRow>()
  }
  return env.DB.prepare(
    `SELECT id, type, name, enabled, config, secret FROM backup_targets
       WHERE user_id = ?1 AND type = 'webdav' ORDER BY enabled DESC, created_at ASC LIMIT 1`,
  ).bind(userId).first<BackupTargetRow>()
}

export async function resolveMusicWebdav(
  env: AppBindings['Bindings'],
  user: SettingsOwner,
  userId: string,
): Promise<MusicWebdavContext> {
  const settings = mergeSettings(JSON.parse(user.settingsRaw || '{}'))
  const dir = normalizeMusicDir(settings.backup.musicDir)
  const row = await loadTargetRow(env, userId, settings.backup.musicTargetId)
  if (!row) {
    throw new ApiError(503, 'storage_unavailable', 'Add a WebDAV backup target before using WebDAV music')
  }
  if (row.type !== 'webdav') {
    throw ApiError.badRequest('The selected music target is not a WebDAV target')
  }
  if (!row.secret) {
    throw new ApiError(503, 'storage_unavailable', 'The selected WebDAV target has no stored credentials')
  }
  const secret = (await decryptSecret<WebdavSecret>(env, row.id, row.secret)) ?? {}
  const config = parseTargetConfig(row.config)
  return { config, secret, dir, base: baseUrl(config), auth: authHeader(config, secret) }
}

async function safeWebdavFetch(
  input: string | URL,
  init: RequestInit,
  trustedOrigin: string,
  replayable = true,
): Promise<Response> {
  try {
    return await webdavFetch(input, init, trustedOrigin, replayable)
  } catch (error) {
    if (error instanceof ApiError) throw error
    console.warn('[inkstone] webdav request failed:', error)
    throw new ApiError(502, 'storage_unavailable', 'The WebDAV server could not be reached')
  }
}

export async function ensureMusicDir(ctx: MusicWebdavContext): Promise<void> {
  await ensureDirs(ctx.base, ctx.auth, [ctx.dir], new Set())
}

export async function listMusicDirectory(ctx: MusicWebdavContext, subPath: string): Promise<MusicWebdavEntry[]> {
  const relative = joinRelative(ctx.dir, subPath)
  const url = childUrl(ctx.base, relative)
  const response = await safeWebdavFetch(url, {
    method: 'PROPFIND',
    headers: {
      Authorization: ctx.auth,
      Depth: PROPFIND_DEPTH,
      'Content-Type': 'application/xml; charset=utf-8',
      'User-Agent': 'InkstoneMusic/1',
    },
  }, ctx.base.origin)
  if (response.status === 401) throw new ApiError(401, 'unauthenticated', 'The WebDAV credentials were rejected')
  if (response.status === 404) throw ApiError.notFound('The music directory does not exist on the WebDAV server')
  if (response.status !== 207 && !response.ok) {
    throw new ApiError(502, 'storage_unavailable', `WebDAV listing failed: HTTP ${response.status}`)
  }
  const bytes = await readResponseBytesWithinLimit(response, PROPFIND_MAX_BYTES)
  const body = new TextDecoder().decode(bytes)
  const absoluteDir = trimSlashes(ctx.base.pathname + relative)
  return parseMultistatus(body)
    .map((entry) => toMusicEntry(entry, absoluteDir, subPath))
    .filter((entry): entry is MusicWebdavEntry => entry !== null)
    .filter((entry) => isAudioEntry({
      href: entry.name, isCollection: entry.isDirectory, sizeBytes: entry.sizeBytes, mime: entry.mime, modifiedAt: entry.modifiedAt,
    }))
    .sort((left, right) => Number(right.isDirectory) - Number(left.isDirectory) || left.name.localeCompare(right.name))
}

function toMusicEntry(
  entry: { href: string; isCollection: boolean; sizeBytes: number; mime: string | null; modifiedAt: number | null },
  absoluteDir: string,
  subPath: string,
): MusicWebdavEntry | null {
  const hrefPath = trimSlashes(decodeHrefPath(entry.href))
  if (hrefPath === absoluteDir || !hrefPath.startsWith(absoluteDir + '/')) return null
  const name = hrefPath.slice(absoluteDir.length + 1)
  if (!name || name.includes('/')) return null
  return {
    name,
    path: subPath ? subPath + '/' + name : name,
    isDirectory: entry.isCollection,
    sizeBytes: entry.sizeBytes,
    mime: entry.mime,
    modifiedAt: entry.modifiedAt,
  }
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+/, '').replace(/\/+$/, '')
}

export async function statMusicObject(ctx: MusicWebdavContext, relativePath: string): Promise<{ sizeBytes: number; mime: string | null } | null> {
  const path = joinRelative(ctx.dir, relativePath)
  const url = childUrl(ctx.base, path)
  const response = await safeWebdavFetch(url, {
    method: 'PROPFIND',
    headers: {
      Authorization: ctx.auth,
      Depth: '0',
      'Content-Type': 'application/xml; charset=utf-8',
      'User-Agent': 'InkstoneMusic/1',
    },
  }, ctx.base.origin)
  if (response.status === 401) throw new ApiError(401, 'unauthenticated', 'The WebDAV credentials were rejected')
  if (response.status === 404) return null
  if (response.status === 207) {
    const bytes = await readResponseBytesWithinLimit(response, PROPFIND_MAX_BYTES)
    const entries = parseMultistatus(new TextDecoder().decode(bytes))
    if (!entries.length) return null
    const entry = entries[0]!
    return { sizeBytes: entry.sizeBytes, mime: entry.mime }
  }
  if (response.status === 405 || response.status === 501) return await statWithHead(ctx, url, response)
  throw new ApiError(502, 'storage_unavailable', `WebDAV lookup failed: HTTP ${response.status}`)
}

async function statWithHead(
  ctx: MusicWebdavContext,
  url: string,
  propfindResponse: Response,
): Promise<{ sizeBytes: number; mime: string | null } | null> {
  await cancelStreamBestEffort(propfindResponse.body)
  const head = await safeWebdavFetch(url, {
    method: 'HEAD',
    headers: { Authorization: ctx.auth, 'User-Agent': 'InkstoneMusic/1' },
  }, ctx.base.origin)
  if (head.status === 404) return null
  if (!head.ok && head.status !== 405) {
    throw new ApiError(502, 'storage_unavailable', `WebDAV lookup failed: HTTP ${head.status}`)
  }
  const declared = Number(head.headers.get('Content-Length'))
  return { sizeBytes: Number.isFinite(declared) && declared > 0 ? declared : 0, mime: head.headers.get('Content-Type') }
}

export async function putMusicObject(
  ctx: MusicWebdavContext,
  relativePath: string,
  bytes: Uint8Array,
  mime: string,
): Promise<void> {
  await ensureMusicDir(ctx)
  const response = await safeWebdavFetch(childUrl(ctx.base, joinRelative(ctx.dir, relativePath)), {
    method: 'PUT',
    headers: { Authorization: ctx.auth, 'Content-Type': mime, Overwrite: 'T', 'User-Agent': 'InkstoneMusic/1' },
    body: toArrayBuffer(bytes),
  }, ctx.base.origin, false)
  if (response.status === 401) throw new ApiError(401, 'unauthenticated', 'The WebDAV credentials were rejected')
  if (response.status === 403) throw ApiError.forbidden('The WebDAV account has no write access')
  if (response.status === 507) throw ApiError.tooLarge('The WebDAV server is out of storage')
  if (!response.ok) throw new ApiError(502, 'storage_unavailable', `WebDAV upload failed: HTTP ${response.status}`)
}

export async function deleteMusicObject(ctx: MusicWebdavContext, relativePath: string): Promise<void> {
  const response = await safeWebdavFetch(childUrl(ctx.base, joinRelative(ctx.dir, relativePath)), {
    method: 'DELETE',
    headers: { Authorization: ctx.auth, 'User-Agent': 'InkstoneMusic/1' },
  }, ctx.base.origin)
  if (response.status === 401) throw new ApiError(401, 'unauthenticated', 'The WebDAV credentials were rejected')
  if (response.status === 403) throw ApiError.forbidden('The WebDAV account has no delete access')
  if (response.status === 404) return
  if (!response.ok && response.status !== 204) {
    throw new ApiError(502, 'storage_unavailable', 'WebDAV delete failed: HTTP ' + response.status)
  }
}

export async function fetchMusicObject(ctx: MusicWebdavContext, relativePath: string, rangeHeader: string | null): Promise<Response> {
  return safeWebdavFetch(childUrl(ctx.base, joinRelative(ctx.dir, relativePath)), {
    method: 'GET',
    headers: {
      Authorization: ctx.auth,
      'User-Agent': 'InkstoneMusic/1',
      ...(rangeHeader ? { Range: rangeHeader } : {}),
    },
  }, ctx.base.origin)
}

// A fresh ArrayBuffer keeps the PUT body assignable to BodyInit without a cast.
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function joinRelative(dir: string, subPath: string): string {
  const clean = subPath.split('/').map((segment) => segment.trim()).filter((segment) => segment && segment !== '.' && segment !== '..')
  return [dir, ...clean].join('/')
}