import { describe, expect, it } from 'vitest'
import { applyTagNodes, GRAPH_TAG_EDGE_LIMIT } from './graph-tag-nodes'
import type { GraphEdge, GraphNode } from './types'

/**
 * Tag clusters are the densest source of edges one response can fan out into, so the budget that keeps
 * a request finite lives here: clusters are expanded largest-first, and one that does not fit stays
 * unexpanded rather than half-connected, which is what keeps a tag node's degree equal to its edges.
 */

function clustered(sizes: number[]): Map<string, Array<{ name: string }>> {
  const tagsByNote = new Map<string, Array<{ name: string }>>()
  sizes.forEach((size, index) => {
    for (let member = 0; member < size; member++)
      tagsByNote.set(`note-${index}-${member}`, [{ name: `topic-${index}` }])
  })
  return tagsByNote
}

function expand(sizes: number[]) {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const result = applyTagNodes(nodes, edges, clustered(sizes))
  return { nodes, edges, ...result }
}

describe('the tag-member edge budget (G-02)', () => {
  it('expands every cluster while the members fit inside the budget', () => {
    const { nodes, edges, added, dropped } = expand([2, 2, 1])

    expect(added).toBe(3)
    expect(dropped).toBe(0)
    expect(edges).toHaveLength(5)
    for (const node of nodes.filter((entry) => entry.kind === 'tag'))
      expect(edges.filter((edge) => edge.target === node.id)).toHaveLength(node.degree)
  })

  it('never lets the expanded members cross the budget', () => {
    const sizes = Array.from({ length: 30 }, (_, index) => 100 + index)
    const { edges, added, dropped } = expand(sizes)

    expect(edges.length).toBeLessThanOrEqual(GRAPH_TAG_EDGE_LIMIT)
    expect(added).toBeLessThan(sizes.length)
    expect(added + dropped).toBe(sizes.length)
  })

  it('skips a cluster that does not fit and keeps expanding the ones that do', () => {
    const { nodes, added, dropped } = expand([GRAPH_TAG_EDGE_LIMIT - 400, 600, 300])

    expect(added).toBe(2)
    expect(dropped).toBe(1)
    expect(nodes.find((node) => node.id === 'tag:topic-0')).toBeTruthy()
    expect(nodes.find((node) => node.id === 'tag:topic-1')).toBeFalsy()
    expect(nodes.find((node) => node.id === 'tag:topic-2')).toBeTruthy()
  })

  it('leaves a single oversized cluster unexpanded rather than half-connected', () => {
    const { nodes, edges, added, dropped } = expand([GRAPH_TAG_EDGE_LIMIT + 1])

    expect(added).toBe(0)
    expect(dropped).toBe(1)
    expect(nodes).toHaveLength(0)
    expect(edges).toHaveLength(0)
  })
})
