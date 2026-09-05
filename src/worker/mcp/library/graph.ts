import { requireOwnedNote } from './helpers';

// Per-node round trips (up to 2 queries x up to 100 nodes) serialized a whole
// MCP graph exploration; batch each BFS level into chunked IN queries instead
// so a full explore costs a handful of requests. Chunk at 80 to stay under
// D1's sql-variable limit with the user binding included.
const MCP_GRAPH_QUERY_CHUNK = 80

const MCP_GRAPH_EDGES_PER_NODE = 100

async function loadMcpNotesByIds(
  db: D1Database,
  userId: string,
  ids: string[],
): Promise<Array<{ id: string; title: string; excerpt: string }>> {
  const rows: Array<{ id: string; title: string; excerpt: string }> = []
  for (let index = 0; index < ids.length; index += MCP_GRAPH_QUERY_CHUNK) {
    const chunk = ids.slice(index, index + MCP_GRAPH_QUERY_CHUNK)
    const { results } = await db.prepare(
      `SELECT id, title, excerpt FROM notes
        WHERE user_id = ?1 AND deleted_at IS NULL AND id IN (${placeholders(chunk.length, 2)})`,
    ).bind(userId, ...chunk).all<{ id: string; title: string; excerpt: string }>()
    rows.push(...results)
  }
  return rows
}

async function loadMcpLinkEdges(
  db: D1Database,
  userId: string,
  ids: string[],
): Promise<Array<{ source_note_id: string; target_note_id: string }>> {
  const rows: Array<{ source_note_id: string; target_note_id: string }> = []
  for (let index = 0; index < ids.length; index += MCP_GRAPH_QUERY_CHUNK) {
    const chunk = ids.slice(index, index + MCP_GRAPH_QUERY_CHUNK)
    // Keep the original per-node LIMIT 100 cap in aggregate, split into a
    // source-side and a target-side query (each satisfies its own index) so
    // the batch never fetches more than the sequential version would.
    const limit = chunk.length * MCP_GRAPH_EDGES_PER_NODE
    const [sourceSide, targetSide] = await Promise.all([
      db.prepare(
        `SELECT source_note_id, target_note_id FROM links
          WHERE user_id = ?1 AND target_note_id IS NOT NULL
            AND source_note_id IN (${placeholders(chunk.length, 2)}) LIMIT ?${chunk.length + 2}`,
      ).bind(userId, ...chunk, limit).all<{ source_note_id: string; target_note_id: string }>(),
      db.prepare(
        `SELECT source_note_id, target_note_id FROM links
          WHERE user_id = ?1 AND target_note_id IS NOT NULL
            AND target_note_id IN (${placeholders(chunk.length, 2)}) LIMIT ?${chunk.length + 2}`,
      ).bind(userId, ...chunk, limit).all<{ source_note_id: string; target_note_id: string }>(),
    ])
    rows.push(...sourceSide.results, ...targetSide.results)
  }
  return rows
}

function placeholders(count: number, start: number): string {
  return Array.from({ length: count }, (_, i) => `?${start + i}`).join(', ')
}

export async function exploreMcpGraph(
  db: D1Database,
  userId: string,
  origin: string,
  rootId: string,
  depth = 2,
  maxNodes = 60,
) {
  await requireOwnedNote(db, userId, rootId)
  const cappedDepth = Math.max(1, Math.min(3, depth))
  const cappedNodes = Math.max(2, Math.min(100, maxNodes))
  const nodes = new Map<string, { id: string; title: string; excerpt: string }>()
  const edges = new Map<string, { source: string; target: string }>()
  let frontier = [rootId]
  for (let level = 0; level <= cappedDepth && frontier.length && nodes.size < cappedNodes; level++) {
    const next = new Set<string>()
    const present = new Set<string>()
    for (const note of await loadMcpNotesByIds(db, userId, frontier)) {
      nodes.set(note.id, note)
      present.add(note.id)
    }
    if (level < cappedDepth && present.size) {
      for (const edge of await loadMcpLinkEdges(db, userId, [...present])) {
        edges.set(`${edge.source_note_id}:${edge.target_note_id}`, {
          source: edge.source_note_id,
          target: edge.target_note_id,
        })
        const adjacent = present.has(edge.source_note_id)
          ? edge.target_note_id
          : edge.source_note_id
        if (!nodes.has(adjacent) && nodes.size + next.size < cappedNodes) next.add(adjacent)
      }
    }
    frontier = [...next]
  }
  return {
    root_id: rootId,
    nodes: [...nodes.values()].map((node) => ({
      ...node,
      url: `${origin.replace(/\/$/, '')}/n/${encodeURIComponent(node.id)}`,
    })),
    edges: [...edges.values()].filter((edge) => nodes.has(edge.source) && nodes.has(edge.target)),
    truncated: frontier.length > 0 || nodes.size >= cappedNodes,
  }
}
