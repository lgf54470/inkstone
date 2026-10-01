import { describe, expect, it } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { exploreMcpGraph } from '../src/worker/mcp/library'
import { registerAssetsTools } from '../src/worker/mcp/server/assets'
import type { McpToolCtx } from '../src/worker/mcp/server/context'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

/**
 * The app's own graph leaves archived notes out — they are not nodes, and links through them are not
 * edges — while the MCP tool used to answer with them, titles and excerpts included. The tool and the
 * surface have to agree about what the graph is: these cases read the tool's own answer and the words
 * it advertises, against the scope the app enforces.
 */

const USER = 'mcp-graph-user'
const ROOT = 'a'.repeat(26)
const ACTIVE = 'b'.repeat(26)
const ARCHIVED = 'c'.repeat(26)
const ORIGIN = 'https://notes.example.test'

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  return db
}

async function seedNote(db: D1Shim, id: string, title: string, isArchived = 0): Promise<void> {
  await runSql(
    db,
    `INSERT INTO notes (id, user_id, folder_id, title, title_key, content, excerpt, rev, word_count, char_count,
       is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at)
     VALUES (?1, ?2, NULL, ?3, ?3, '', '', 1, 0, 0, 0, 0, ?4, 0, 'hash', 1, 1)`,
    id, USER, title, isArchived,
  )
}

async function seedLink(db: D1Shim, source: string, target: string): Promise<void> {
  await runSql(
    db,
    `INSERT INTO links (source_note_id, target_note_id, target_key, target_title, user_id)
     VALUES (?1, ?2, ?3, ?3, ?4)`,
    source, target, target, USER,
  )
}

describe('MCP note graph scope (G-04, real D1)', () => {
  it('answers without the archived note or the edge that led to it', async () => {
    const db = await makeDb()
    await seedNote(db, ROOT, 'Root')
    await seedNote(db, ACTIVE, 'Active')
    await seedNote(db, ARCHIVED, 'Archived', 1)
    await seedLink(db, ROOT, ACTIVE)
    await seedLink(db, ROOT, ARCHIVED)

    const graph = await exploreMcpGraph(db as unknown as D1Database, USER, ORIGIN, ROOT, 2, 60)

    expect(graph.nodes.map((node) => node.id).sort()).toEqual([ROOT, ACTIVE].sort())
    expect(graph.edges).toEqual([{ source: ROOT, target: ACTIVE }])
  })

  it('names the archived and deleted scope in the tool description a client reads', async () => {
    const registered: Array<{ name: string; description: string }> = []
    const server = {
      registerTool: (name: string, config: { description: string }) => {
        registered.push({ name, description: config.description })
      },
    }
    registerAssetsTools({ server, options: {}, writes: {}, library: {} } as unknown as McpToolCtx)

    const tool = registered.find((entry) => entry.name === 'explore_note_graph')
    expect(tool?.description).toMatch(/archived/i)
    expect(tool?.description).toMatch(/deleted/i)
  })
})
