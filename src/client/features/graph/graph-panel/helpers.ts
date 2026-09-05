import type { GraphResponse } from '@shared/types'
import { organizerColorOrNull } from '@shared/organizer-colors'
import { truncateText } from '@shared/text-utils'
import { type GraphPreferences, type GroupBy } from '../../../lib/graph-settings'
import { DEFAULT_PREFERENCES, GRAPH_PREFS_KEY } from './constants'
import type { CanvasNode } from './types'

export function graphScaleAfterWheel(scale: number, deltaY: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return scale
  return Math.min(4, Math.max(0.2, scale * (deltaY > 0 ? 0.92 : 1.08)))
}

export function loadPreferences(): GraphPreferences {
  if (typeof localStorage === 'undefined') return DEFAULT_PREFERENCES
  try {
    const stored = JSON.parse(localStorage.getItem(GRAPH_PREFS_KEY) ?? '{}') as Partial<GraphPreferences>
    return {
      mode: stored.mode === 'local' ? 'local' : 'global',
      depth: boundedPreference(stored.depth, DEFAULT_PREFERENCES.depth, 1, 3),
      includeOrphans: booleanPreference(stored.includeOrphans, DEFAULT_PREFERENCES.includeOrphans),
      includeUnresolved: booleanPreference(stored.includeUnresolved, DEFAULT_PREFERENCES.includeUnresolved),
      arrows: booleanPreference(stored.arrows, DEFAULT_PREFERENCES.arrows),
      labels: booleanPreference(stored.labels, DEFAULT_PREFERENCES.labels),
      groupBy: stored.groupBy === 'folder' || stored.groupBy === 'tag' ? stored.groupBy : 'none',
      folderId: typeof stored.folderId === 'string' && /^[0-9a-hjkmnp-tv-z]{26}$/.test(stored.folderId)
        ? stored.folderId
        : '',
      tag: typeof stored.tag === 'string' ? truncateText(stored.tag.trim(), 60) : '',
      tagsMatch: stored.tagsMatch === 'all' ? 'all' : 'any',
      clearResetsTag: booleanPreference(stored.clearResetsTag, DEFAULT_PREFERENCES.clearResetsTag),
      clearClosesPanel: booleanPreference(stored.clearClosesPanel, DEFAULT_PREFERENCES.clearClosesPanel),
      repulsion: boundedPreference(stored.repulsion, DEFAULT_PREFERENCES.repulsion, 300, 1800),
      linkDistance: boundedPreference(stored.linkDistance, DEFAULT_PREFERENCES.linkDistance, 40, 150),
      nodeScale: boundedPreference(stored.nodeScale, DEFAULT_PREFERENCES.nodeScale, 0.7, 1.8),
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

function boundedPreference(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

function booleanPreference(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function nodeColor(node: CanvasNode, groupBy: GroupBy, fallback: string): string {
  if (groupBy === 'folder') return organizerColorOrNull(node.folderColor) ?? fallback
  if (groupBy === 'tag') return organizerColorOrNull(node.tags[0]?.color) ?? fallback
  return fallback
}

export function normalizedResponse(response: GraphResponse): GraphResponse {
  const nodes = response.nodes.map((node) => ({
    ...node,
    kind: node.kind ?? 'note',
    inDegree: node.inDegree ?? 0,
    outDegree: node.outDegree ?? 0,
    folderId: node.folderId ?? null,
    folderName: node.folderName ?? null,
    folderColor: node.folderColor ?? null,
    tags: node.tags ?? [],
  }))
  return {
    nodes,
    edges: response.edges,
    meta: response.meta ?? {
      mode: 'global', centerId: null, depth: 1,
      totalNodes: nodes.length, totalEdges: response.edges.length,
      truncated: false, limit: nodes.length,
    },
  }
}

