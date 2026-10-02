export interface GraphNode {
  id: string
  title: string
  /** `tag` nodes are synthesized from note tags, `unresolved` from links to missing notes. */
  kind: 'note' | 'unresolved' | 'tag'
  degree: number
  inDegree: number
  outDegree: number
  folderId: string | null
  folderName: string | null
  folderColor: string | null
  tags: Array<{ name: string; color: string | null }>
}

export interface GraphEdge {
  source: string
  target: string
}

export interface GraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  meta: {
    mode: 'global' | 'local'
    centerId: string | null
    depth: number
    totalNodes: number
    totalEdges: number
    truncated: boolean
    limit: number
  }
}

export interface GraphQuery {
  mode?: 'global' | 'local'
  center?: string
  depth?: number
  q?: string
  folderId?: string
  tag?: string
  /** Tags to filter by. Overrides `tag`; sent comma-separated. */
  tags?: string[]
  /** How multiple tags combine: `any` (default) for union, `all` for intersection. */
  tagsMatch?: 'any' | 'all'
  includeOrphans?: boolean
  includeUnresolved?: boolean
  /** Draw each tag as its own node, linking the notes that carry it. Sent as `1`. */
  showTagNodes?: boolean
  /** Notes the reader took out of the graph. Sent comma-separated, like `tags` (G-42). */
  excluded?: string[]
  /** Which side of a link a local graph walks. Only meaningful with `mode: 'local'` (G-44). */
  direction?: 'both' | 'incoming' | 'outgoing'
  limit?: number
}
