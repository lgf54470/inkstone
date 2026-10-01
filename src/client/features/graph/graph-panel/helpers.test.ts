import { beforeEach, describe, expect, it } from 'vitest'
import { GRAPH_COLOR_GROUP_LIMIT, type GraphColorGroup } from '../../../lib/graph-settings'
import { COLOR_GROUP_QUERY_MAX, GRAPH_PREFS_KEY } from './constants'
import {
  buildColorLegends,
  colorGroupsByNodeId,
  countWikiLinkEdges,
  graphNodeCounts,
  graphPrefsStorageKey,
  graphScaleAfterWheel,
  loadPreferences,
  nodeColor,
  tagColorsByName,
  tagHashIndex,
} from './helpers'
import type { GraphResponse } from '@shared/types'
import type { CanvasNode } from './types'

/** Ten slots of the theme palette the canvas paints with; the values only label a slot here. */
const tagPalette = ['#010101', '#020202', '#030303', '#040404', '#050505', '#060606', '#070707', '#080808', '#090909', '#0a0a0a']

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
    colorGroup: null,
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
    const grouped = { fallback: '#cccccc', tagPalette }
    expect(nodeColor(node, { ...grouped, groupBy: 'folder' })).toBe('#dc2626')
    expect(nodeColor(node, { ...grouped, groupBy: 'tag' })).toBe('#059669')
    expect(nodeColor(node, { ...grouped, groupBy: 'none' })).toBe('#cccccc')
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
    expect(nodeColor(colored, { groupBy: 'none', fallback: '#cccccc', tagPalette })).toBe('#059669')
    expect(nodeColor(colored, { groupBy: 'folder', fallback: '#cccccc', tagPalette })).toBe('#059669')
    expect(nodeColor(plain, { groupBy: 'none', fallback: '#cccccc', tagPalette })).toBe(tagPalette[tagHashIndex('idea')])
  })

  it('paints a tag with no colour of its own from the palette slot its name falls on', () => {
    const plain = asTagNode({ id: 'tag:idea', title: 'idea', tagColor: null })
    expect(tagHashIndex('idea')).toBe(3)
    expect(nodeColor(plain, { groupBy: 'none', fallback: '#cccccc', tagPalette })).toBe('#040404')
  })

  it('lists tag nodes in the legend as a reference to their palette token, and stays empty without them', () => {
    const note = { ...createTestNode(), id: 'note-1', tags: [{ name: 'work', color: '#059669' }] }
    const tag = asTagNode({ id: 'tag:work', title: 'work', tagColor: null })
    expect(buildColorLegends([note, tag], 'none')).toEqual([{ label: 'work', color: '#059669' }])
    const uncolored = asTagNode({ id: 'tag:idea', title: 'idea', tagColor: null })
    expect(buildColorLegends([note, uncolored], 'none')).toEqual([{ label: 'idea', color: 'var(--graph-tag-4)' }])
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

function colorRule(overrides: Partial<GraphColorGroup> = {}): GraphColorGroup {
  return { id: 'r1', query: 'tag:urgent', color: '#4f46e5', ...overrides }
}

describe('color group rules (FEAT-04)', () => {
  it('maps each rule onto the notes its filter line matches, with the first rule winning', () => {
    const urgent = { ...createTestNode(), id: 'a' }
    const untagged = { ...createTestNode(), id: 'b', tags: [] }
    const index = colorGroupsByNodeId([urgent, untagged], [
      colorRule(),
      colorRule({ id: 'r2', query: 'path:work', color: '#059669' }),
    ])
    expect(index.get('a')).toEqual({ label: 'tag:urgent', color: '#4f46e5' })
    expect(index.get('b')).toEqual({ label: 'path:work', color: '#059669' })
  })

  it('skips a rule that is blank or off-palette, and leaves tag nodes alone', () => {
    const urgent = { ...createTestNode(), id: 'a' }
    const tagNode = asTagNode({ id: 'tag:note', title: 'Note 1' })
    expect(colorGroupsByNodeId([urgent], [colorRule({ query: '  ' })]).size).toBe(0)
    expect(colorGroupsByNodeId([urgent], [colorRule({ color: '#123456' })]).size).toBe(0)
    expect([...colorGroupsByNodeId([urgent, tagNode], [colorRule({ query: 'note' })]).keys()]).toEqual(['a'])
  })

  it('paints the matched rule over the folder and tag groupings', () => {
    const ruled = { ...createTestNode(), colorGroup: '#4f46e5' }
    const grouped = { fallback: '#cccccc', tagPalette }
    expect(nodeColor(ruled, { ...grouped, groupBy: 'folder' })).toBe('#4f46e5')
    expect(nodeColor(ruled, { ...grouped, groupBy: 'tag' })).toBe('#4f46e5')
    expect(nodeColor(ruled, { ...grouped, groupBy: 'none' })).toBe('#4f46e5')
  })
})

describe('color group rules legend and storage (FEAT-04)', () => {

  it('lists the rules on screen in the legend ahead of the grouping, and drops those with no match', () => {
    const node = createTestNode()
    expect(buildColorLegends([node], 'none', [colorRule()])).toEqual([{ label: 'tag:urgent', color: '#4f46e5' }])
    expect(buildColorLegends([node], 'folder', [colorRule()])).toEqual([
      { label: 'tag:urgent', color: '#4f46e5' },
      { label: 'Work', color: '#dc2626' },
    ])
    expect(buildColorLegends([{ ...node, tags: [] }], 'none', [colorRule()])).toEqual([])
  })

  it('reads rules back from storage trimmed, palette-checked and capped', () => {
    const key = `${GRAPH_PREFS_KEY}.color-user`
    localStorage.setItem(key, JSON.stringify({
      colorGroups: [
        { id: 'a', query: '  tag:one  ', color: '#4f46e5' },
        { id: 'b', query: '', color: '#4f46e5' },
        { id: 'c', query: 'tag:three', color: 'red' },
        { id: 'd', query: 'tag:four', color: '#059669' },
        { id: 'e', query: 'tag:fifty', color: '#059669' },
        { id: 'f', query: 'tag:' + 'x'.repeat(200), color: '#0891b2' },
      ],
    }))
    const groups = loadPreferences('color-user').colorGroups
    expect(groups.map((group) => group.id)).toEqual(['a', 'd', 'e', 'f'])
    expect(groups[0]?.query).toBe('tag:one')
    expect(groups[3]?.query).toHaveLength(COLOR_GROUP_QUERY_MAX)
  })

  it('drops rules past the cap instead of storing a longer list than the panel can show', () => {
    const key = `${GRAPH_PREFS_KEY}.many-user`
    const many = Array.from({ length: GRAPH_COLOR_GROUP_LIMIT + 3 }, (_, index) => ({
      id: `r${index}`, query: `tag:t${index}`, color: '#059669',
    }))
    localStorage.setItem(key, JSON.stringify({ colorGroups: many }))
    expect(loadPreferences('many-user').colorGroups).toHaveLength(GRAPH_COLOR_GROUP_LIMIT)
  })
})

function countedNode(id: string, kind: GraphResponse['nodes'][number]['kind']): GraphResponse['nodes'][number] {
  return { id, title: id, kind, degree: 0, inDegree: 0, outDegree: 0, folderId: null, folderName: null, folderColor: null, tags: [] }
}

describe('the node counts the header and the badge share (G-38)', () => {
  it('splits a response into notes, tags and unresolved nodes', () => {
    expect(graphNodeCounts([
      countedNode('note-1', 'note'),
      countedNode('note-2', 'note'),
      countedNode('tag:work', 'tag'),
      countedNode('ghost:zeta', 'unresolved'),
    ])).toEqual({ notes: 2, tags: 1, unresolved: 1 })
    expect(graphNodeCounts([])).toEqual({ notes: 0, tags: 0, unresolved: 0 })
  })
})
