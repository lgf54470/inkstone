import type { Env } from '../env'
import { deleteAttachmentObjects } from './backend'

export const KANBAN_ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000

const KANBAN_OBJECT_PREFIX = 'kanban/'
const KANBAN_OBJECT_KIND = 'kanban-attachment'
const KANBAN_LIST_PAGE_SIZE = 1000
const KANBAN_MAX_LISTED_OBJECTS = 5000
const KANBAN_DELETE_LIMIT = 200
const REFERENCE_PAGE_SIZE = 100
const REFERENCE_CONTENT_PATTERN = '%kanban%'
const REFERENCE_SOURCES: ReadonlyArray<{ table: string; ownerColumn: string }> = [
  { table: 'notes', ownerColumn: 'user_id' },
  { table: 'blog_posts', ownerColumn: 'user_id' },
  { table: 'community_templates', ownerColumn: 'author_id' },
]

const KANBAN_REFERENCE = /kanban\/(?:file\/)?[^/"\\\s]+\/[^"\\\s]+/g

export interface KanbanReclaimResult {
  scanned: number
  reclaimed: number
  retained: number
  deferred: number
  skipped: number
}

interface KanbanCandidate {
  key: string
  userId: string
  segment: string
  id: string | null
}

export async function reclaimOrphanKanbanFiles(
  env: Env,
  { now = Date.now(), limit = KANBAN_DELETE_LIMIT }: { now?: number; limit?: number } = {},
): Promise<KanbanReclaimResult> {
  const result: KanbanReclaimResult = { scanned: 0, reclaimed: 0, retained: 0, deferred: 0, skipped: 0 }
  if (!env.FILES) return result

  const candidates = await listKanbanCandidates(env.FILES, now, result)
  let budget = limit

  for (const [userId, objects] of candidates) {
    const orphans = await pickOrphanKeys(env.DB, userId, objects, budget, result)
    await deleteOrphans(env, orphans, result)
    budget -= orphans.length
  }

  return result
}

async function pickOrphanKeys(
  db: D1Database,
  userId: string,
  objects: readonly KanbanCandidate[],
  budget: number,
  result: KanbanReclaimResult,
): Promise<string[]> {
  if (budget <= 0) {
    result.deferred += objects.length
    return []
  }
  const referenced = await collectKanbanReferences(db, userId)
  const orphans: string[] = []
  for (const object of objects) {
    if (isReferenced(object, referenced)) result.retained += 1
    else if (orphans.length < budget) orphans.push(object.key)
    else result.deferred += 1
  }
  return orphans
}

function isReferenced(object: KanbanCandidate, referenced: ReadonlySet<string>): boolean {
  return referenced.has(object.segment) || (object.id !== null && referenced.has(object.id))
}

export async function runKanbanFileReclaim(env: Env): Promise<void> {
  try {
    await reclaimOrphanKanbanFiles(env)
  } catch (error) {
    // Best effort: nothing is lost by waiting, the next run re-derives the same candidates.
    console.warn('[inkstone] Kanban object reclaim will retry on the next run:', error)
  }
}

async function listKanbanCandidates(
  files: R2Bucket,
  now: number,
  result: KanbanReclaimResult,
): Promise<Map<string, KanbanCandidate[]>> {
  const candidates = new Map<string, KanbanCandidate[]>()
  let cursor: string | undefined
  let listed = 0
  do {
    const page = await files.list({
      prefix: KANBAN_OBJECT_PREFIX,
      cursor,
      include: ['customMetadata'],
      limit: KANBAN_LIST_PAGE_SIZE,
    })
    for (const object of page.objects) {
      result.scanned += 1
      const candidate = toCandidate(object, now)
      if (!candidate) {
        result.skipped += 1
        continue
      }
      const owned = candidates.get(candidate.userId)
      if (owned) owned.push(candidate)
      else candidates.set(candidate.userId, [candidate])
    }
    listed += page.objects.length
    cursor = page.truncated ? page.cursor ?? undefined : undefined
  } while (cursor && listed < KANBAN_MAX_LISTED_OBJECTS)
  return candidates
}

function toCandidate(object: R2Object, now: number): KanbanCandidate | null {
  const metadata = object.customMetadata
  // An object this code cannot attribute to an account is kept: guessing an owner
  // is how a reclaim turns into a data loss incident.
  if (!metadata?.userId || metadata.kind !== KANBAN_OBJECT_KIND) return null
  // A fresh upload can still be between the response and the save that references it.
  if (now - object.uploaded.getTime() < KANBAN_ORPHAN_GRACE_MS) return null
  const segment = object.key.slice(object.key.lastIndexOf('/') + 1)
  return {
    key: object.key,
    userId: metadata.userId,
    segment,
    id: metadata.objectId || segment.split('-')[0] || null,
  }
}

async function deleteOrphans(
  env: Env,
  keys: readonly string[],
  result: KanbanReclaimResult,
): Promise<void> {
  if (!keys.length) return
  try {
    await deleteAttachmentObjects(env, 'r2', keys)
    result.reclaimed += keys.length
  } catch (error) {
    // The objects are still there, so the next run finds and reaps them again.
    console.warn('[inkstone] Kanban object delete failed, retrying on the next run:', error)
    result.deferred += keys.length
  }
}

async function collectKanbanReferences(db: D1Database, userId: string): Promise<Set<string>> {
  const tokens = new Set<string>()
  for (const source of REFERENCE_SOURCES) {
    let afterId = ''
    while (true) {
      const { results } = await db
        .prepare(
          `SELECT id, content FROM ${source.table}
            WHERE ${source.ownerColumn} = ?1 AND id > ?2 AND content LIKE ?3
            ORDER BY id ASC LIMIT ?4`,
        )
        .bind(userId, afterId, REFERENCE_CONTENT_PATTERN, REFERENCE_PAGE_SIZE)
        .all<{ id: string; content: string }>()
      for (const row of results) addKanbanReferences(tokens, row.content)
      if (results.length < REFERENCE_PAGE_SIZE) break
      afterId = results[results.length - 1]!.id
    }
  }
  return tokens
}

function addKanbanReferences(tokens: Set<string>, content: string): void {
  for (const match of content.matchAll(KANBAN_REFERENCE)) {
    const segment = match[0].slice(match[0].lastIndexOf('/') + 1)
    tokens.add(segment)
    const id = segment.split('-')[0]
    if (id) tokens.add(id)
  }
}
