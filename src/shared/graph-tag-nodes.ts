import { LIMITS } from './constants'
import { truncateText } from './text-utils'
import type { GraphEdge, GraphNode } from './types'

/** Tag nodes are the densest source of edges, so only the widest clusters get one. */
export const GRAPH_TAG_NODE_LIMIT = 60
export const GRAPH_TAG_EDGE_LIMIT = 2_000

export interface GraphTagNodeResult {
  added: number
  dropped: number
}

interface TagCluster {
  name: string
  noteIds: string[]
}

function collectTagClusters(tagsByNote: Map<string, Array<{ name: string }>>): Map<string, TagCluster> {
  const clusters = new Map<string, TagCluster>()
  for (const [noteId, tags] of tagsByNote) {
    for (const tag of tags) {
      const key = tag.name.toLowerCase()
      const cluster = clusters.get(key) ?? { name: tag.name, noteIds: [] }
      cluster.noteIds.push(noteId)
      clusters.set(key, cluster)
    }
  }
  return clusters
}

/**
 * Adds one node per tag plus an edge from every note carrying it, so notes that share a tag but link
 * to nothing of each other end up in the same cluster. The link degrees of the notes stay untouched:
 * a tag membership is not a wiki link, and the read-out counts links.
 *
 * Shared by the Worker route and the demo backend so both answer `tagNodes=1` the same way.
 */
export function applyTagNodes(
  nodes: GraphNode[],
  edges: GraphEdge[],
  tagsByNote: Map<string, Array<{ name: string }>>,
): GraphTagNodeResult {
  const ordered = [...collectTagClusters(tagsByNote).values()]
    .sort((a, b) => b.noteIds.length - a.noteIds.length || a.name.localeCompare(b.name))
  const kept = ordered.slice(0, GRAPH_TAG_NODE_LIMIT)
  let members = 0
  let added = 0
  for (const cluster of kept) {
    if (members + cluster.noteIds.length > GRAPH_TAG_EDGE_LIMIT) continue
    members += cluster.noteIds.length
    added++
    const name = truncateText(cluster.name, LIMITS.tagNameMaxLength)
    nodes.push({
      id: `tag:${name}`,
      title: name,
      kind: 'tag',
      degree: cluster.noteIds.length,
      inDegree: cluster.noteIds.length,
      outDegree: 0,
      folderId: null,
      folderName: null,
      folderColor: null,
      tags: [],
    })
    for (const noteId of cluster.noteIds) edges.push({ source: noteId, target: `tag:${name}` })
  }
  return { added, dropped: ordered.length - added }
}
