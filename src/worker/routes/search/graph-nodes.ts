import type { GraphResponse } from '@shared/types'

/** Turns the collected missing-link map into `unresolved:` nodes, counting each one into its source. */
export function applyUnresolvedNodes(
  nodes: GraphResponse['nodes'],
  edges: GraphResponse['edges'],
  unresolved: Map<string, { title: string; sources: Set<string> }>,
): void {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  for (const [key, missing] of unresolved) {
    const id = `unresolved:${key}`
    nodes.push({
      id,
      title: missing.title,
      kind: 'unresolved',
      degree: missing.sources.size,
      inDegree: missing.sources.size,
      outDegree: 0,
      folderId: null,
      folderPath: null,
      folderColor: null,
      tags: [],
    })
    for (const source of missing.sources) {
      edges.push({ source, target: id })
      const sourceNode = nodeById.get(source)
      if (sourceNode) {
        sourceNode.degree++
        sourceNode.outDegree++
      }
    }
  }
}
