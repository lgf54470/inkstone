import { beforeEach, describe, expect, it } from 'vitest'
import { GRAPH_PREFS_KEY } from './constants'
import {
  buildColorLegends,
  countWikiLinkEdges,
  graphPrefsStorageKey,
  graphScaleAfterWheel,
  loadPreferences,
  nodeColor,
  tagColorsByName,
  tagHashColor,
} from './helpers'
import type { GraphResponse } from '@shared/types'
import type { CanvasNode } from './types'

function createTestNode() {
  return {
    id: 'n1',
    title: 'Note 1',
    kind: 'note' as const,
    degree: 1,
    inDegree: 1,
    outDegree: 0,
    folderId: 'f1',
    folderName: 'Work',
    folderColor: '#dc2626',
    tags: [{ name: 'urgent', color: '#059669' }],
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 4,
    tagColor: null,
  }
}

describe('graph panel preferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('scopes preferences storage key by user id with fallback for anonymous users', () => {
    expect(graphPrefsStorageKey('user-123')).toBe(`${GRAPH_PREFS_KEY}.user-123`)
    expect(graphPrefsStorageKey(null)).toBe(GRAPH_PREFS_KEY)
    expect(graphPrefsStorageKey(undefined)).toBe(GRAPH_PREFS_KEY)
  })

  it('loads user-scoped preferences and falls back to unscoped preferences when missing', () => {
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ mode: 'local', depth: 2 }))
    localStorage.setItem(`${GRAPH_PREFS_KEY}.user-a`, JSON.stringify({ mode: 'global', depth: 3 }))

    const prefsA = loadPreferences('user-a')
    expect(prefsA.mode).toBe('global')
    expect(prefsA.depth).toBe(3)

    const prefsB = loadPreferences('user-b')
    expect(prefsB.mode).toBe('local')
    expect(prefsB.depth).toBe(2)
  })
})

describe('graph panel visuals', () => {
  it('clamps graph scale during mouse wheel zoom within bounds', () => {
    expect(graphScaleAfterWheel(1, 100)).toBeCloseTo(0.92)
    expect(graphScaleAfterWheel(1, -100)).toBeCloseTo(1.08)
    expect(graphScaleAfterWheel(0.2, 100)).toBe(0.2)
    expect(graphScaleAfterWheel(4, -100)).toBe(4)
    expect(graphScaleAfterWheel(1, 0)).toBe(1)
  })

  it('resolves node colors by folder or tag groupings with fallback', () => {
    const node = createTestNode()
    expect(nodeColor(node, 'folder', '#cccccc')).toBe('#dc2626')
    expect(nodeColor(node, 'tag', '#cccccc')).toBe('#059669')
    expect(nodeColor(node, 'none', '#cccccc')).toBe('#cccccc')
  })
})

function asTagNode(overrides: Partial<CanvasNode>): CanvasNode {
  return { ...createTestNode(), kind: 'tag', tags: [], ...overrides }
}

function responseWith(nodes: CanvasNode[], edges: Array<{ source: string, target: string }>): GraphResponse {
  return {
    nodes,
    edges,
    meta: { mode: 'global', centerId: null, depth: 1, totalNodes: nodes.length, totalEdges: edges.length, truncated: false, limit: 350 },
  }
}

describe('tag nodes (FEAT-03)', () => {
  it('reads each tag color off the notes that carry it, case-insensitively', () => {
    const first = { ...createTestNode(), id: 'a', tags: [{ name: 'Backlog', color: null }] }
    const second = { ...createTestNode(), id: 'b', tags: [{ name: 'backlog', color: '#059669' }] }
    expect(tagColorsByName([first, second]).get('backlog')).toBe('#059669')
    expect(tagColorsByName([first]).get('backlog')).toBeNull()
    expect(tagColorsByName([first, second]).has('Backlog')).toBe(false)
  })

  it('paints a tag node with its own color whatever the grouping is', () => {
    const colored = asTagNode({ id: 'tag:work', title: 'work', tagColor: '#059669' })
    const plain = asTagNode({ id: 'tag:idea', title: 'idea', tagColor: null })
    expect(nodeColor(colored, 'none', '#cccccc')).toBe('#059669')
    expect(nodeColor(colored, 'folder', '#cccccc')).toBe('#059669')
    expect(nodeColor(plain, 'none', '#cccccc')).toBe(tagHashColor('idea'))
  })

  it('lists tag nodes in the legend even with no grouping, and stays empty without them', () => {
    const note = { ...createTestNode(), id: 'note-1', tags: [{ name: 'work', color: '#059669' }] }
    const tag = asTagNode({ id: 'tag:work', title: 'work', tagColor: null })
    expect(buildColorLegends([note, tag], 'none')).toEqual([{ label: 'work', color: '#059669' }])
    const uncolored = asTagNode({ id: 'tag:idea', title: 'idea', tagColor: null })
    expect(buildColorLegends([note, uncolored], 'none')).toEqual([{ label: 'idea', color: tagHashColor('idea') }])
    expect(buildColorLegends([note], 'none')).toEqual([])
  })

  it('counts only wiki links in the stats, leaving tag memberships out and ghosts in', () => {
    const note = { ...createTestNode(), id: 'note-1' }
    const tag = asTagNode({ id: 'tag:work', title: 'work' })
    const ghost = { ...createTestNode(), id: 'unresolved:missing', kind: 'unresolved' as const }
    const withoutTags = responseWith([note], [{ source: 'note-1', target: 'unresolved:missing' }])
    expect(countWikiLinkEdges(withoutTags)).toBe(1)
    const withTags = responseWith([note, tag, ghost], [
      { source: 'note-1', target: 'unresolved:missing' },
      { source: 'note-1', target: 'tag:work' },
      { source: 'note-1', target: 'tag:work' },
    ])
    expect(countWikiLinkEdges(withTags)).toBe(1)
  })
})
