import { beforeEach, describe, expect, it } from 'vitest'
import { LIMITS } from '@shared/constants'
import { GRAPH_COLOR_GROUP_LIMIT, GRAPH_FORCE_RANGES, GRAPH_PINNED_MAX, type GraphColorGroup } from '../../../lib/graph-settings'
import { COLOR_GROUP_QUERY_MAX, DEFAULT_PREFERENCES, GRAPH_PREFS_KEY } from './constants'
import {
  buildColorLegends,
  colorGroupsByNodeId,
  countWikiLinkEdges,
  ensureNodeVisible,
  graphNodeCounts,
  graphPrefsStorageKey,
  graphScaleAfterWheel,
  graphSearchHits,
  loadPreferences,
  nextPinnedIds,
  nodeColor,
  pickNeighborInDirection,
  tagColorsByName,
  tagHashIndex,
} from './helpers'
import type { GraphResponse } from '@shared/types'
import type { CanvasNode, CanvasState } from './types'

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

  it('keeps a stored node limit inside the bounds the server answers with (G-21)', () => {
    // The bounds are the server's own, so a slider cannot offer a number the route would refuse.
    expect(LIMITS.graphNodeLimitMax).toBeGreaterThan(LIMITS.graphNodeLimitDefault)
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ limit: 9_999 }))
    expect(loadPreferences(null).limit).toBe(LIMITS.graphNodeLimitMax)
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ limit: 1 }))
    expect(loadPreferences(null).limit).toBe(LIMITS.graphNodeLimitMin)
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({}))
    expect(loadPreferences(null).limit).toBe(LIMITS.graphNodeLimitDefault)
  })

  it('clamps each force to the same bounds the drawer drags on (G-32)', () => {
    for (const control of GRAPH_FORCE_RANGES) {
      expect(DEFAULT_PREFERENCES[control.prefKey]).toBe(control.default)
      localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ [control.prefKey]: control.max * 100 }))
      expect(loadPreferences(null)[control.prefKey]).toBe(control.max)
      localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ [control.prefKey]: control.min / 100 }))
      expect(loadPreferences(null)[control.prefKey]).toBe(control.min)
    }
  })

})

describe('graph panel stored pins', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('keeps only ids a graph can hold in the stored pins (G-07)', () => {
    const noteId = 'a'.repeat(26)
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ pinnedNodeIds: [noteId, 'tag:work', 'nonsense', '', 42, null, noteId] }))

    // Duplicates collapse here: a pin held twice would be drawn once and counted twice.
    expect(loadPreferences(null).pinnedNodeIds).toEqual([noteId, 'tag:work'])
  })

  it('refuses a stored pin list longer than a page can show (G-07)', () => {
    const ids = Array.from({ length: GRAPH_PINNED_MAX + 25 }, (_unused, index) => `tag:t${index}`)
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ pinnedNodeIds: ids }))

    expect(loadPreferences(null).pinnedNodeIds).toHaveLength(GRAPH_PINNED_MAX)
  })

  it('treats anything that is not a list of strings as no pins at all (G-07)', () => {
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ pinnedNodeIds: 'note-1' }))
    expect(loadPreferences(null).pinnedNodeIds).toEqual([])
    localStorage.setItem(GRAPH_PREFS_KEY, '{not json')
    expect(loadPreferences(null).pinnedNodeIds).toEqual([])
  })

  it('puts a fresh pin last and drops every copy of the one the reader let go (G-07)', () => {
    const first = 'a'.repeat(26)
    const second = 'b'.repeat(26)

    // A pin that arrives twice is stored once: the panel dedupes on the way in, so ordering is the only rule left.
    expect(nextPinnedIds([first], second, true)).toEqual([first, second])
    expect(nextPinnedIds([first], first, true)).toEqual([first])
    expect(nextPinnedIds([first, second, first], first, false)).toEqual([second])
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
    expect(buildColorLegends([note, tag], 'none')).toEqual([{ label: 'work', color: '#059669', query: 'tag:work' }])
    const uncolored = asTagNode({ id: 'tag:idea', title: 'idea', tagColor: null })
    expect(buildColorLegends([note, uncolored], 'none')).toEqual([{ label: 'idea', color: 'var(--graph-tag-4)', query: 'tag:idea' }])
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
    expect(buildColorLegends([node], 'none', [colorRule()])).toEqual([{ label: 'tag:urgent', color: '#4f46e5', query: 'tag:urgent' }])
    expect(buildColorLegends([node], 'folder', [colorRule()])).toEqual([
      { label: 'tag:urgent', color: '#4f46e5', query: 'tag:urgent' },
      { label: 'Work', color: '#dc2626', query: 'path:Work' },
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

describe('legend rows a reader can press (G-14)', () => {
  /** The rows a single note produces on its own, which is the colour it is drawn under. */
  function rowsFor(node: CanvasNode, groupBy: 'folder' | 'tag'): string[] {
    return buildColorLegends([node], groupBy).map((row) => row.label)
  }

  it('gives every row the filter line that still selects the nodes drawn under it', () => {
    const work = { ...createTestNode(), id: 'a' }
    const play = { ...createTestNode(), id: 'b', folderName: 'Play', folderColor: '#059669', tags: [{ name: 'idea', color: null }] }
    const nodes: CanvasNode[] = [work, play, asTagNode({ id: 'tag:idea', title: 'idea', tagColor: null })]
    for (const groupBy of ['folder', 'tag'] as const) {
      for (const row of buildColorLegends(nodes, groupBy)) {
        const hits = graphSearchHits(nodes, row.query)
        expect(hits, `${row.query} selects nothing`).not.toBeNull()
        for (const node of nodes.filter((candidate) => rowsFor(candidate, groupBy).includes(row.label))) {
          expect(hits!.has(node.id)).toBe(true)
        }
      }
    }
  })

  it('labels a colour rule row with the rule line itself, so pressing it re-enters that rule', () => {
    const row = buildColorLegends([createTestNode()], 'none', [colorRule({ query: 'tag:urgent -path:play' })])[0]
    expect(row).toEqual({ label: 'tag:urgent -path:play', color: '#4f46e5', query: 'tag:urgent -path:play' })
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

/** A canvas state at a size and a camera the camera case can read; every other field stays inert. */
function canvasState(): CanvasState {
  return {
    nodes: [], edges: [], scale: 1, offsetX: 0, offsetY: 0, width: 800, height: 600, viewLeft: 0, viewTop: 0,
    dragging: null, pointers: new Map(), pinch: null, searchHits: null, frame: 0, raf: 0, schedule: null,
  }
}

function placed(id: string, x: number, y: number): CanvasNode {
  return { ...createTestNode(), id, title: id, x, y, r: 10 }
}

describe('arrow keys that move by place rather than by response order (G-23)', () => {
  it('picks the node the arrow points at, not the next one in the response', () => {
    const nodes = [placed('a', 0, 0), placed('b', -120, 0), placed('c', 60, 0)]
    expect(pickNeighborInDirection(nodes, 0, 'right')).toBe(2)
    expect(pickNeighborInDirection(nodes, 0, 'left')).toBe(1)
  })

  it('prefers the node straight ahead over a nearer one off to the side', () => {
    const nodes = [placed('a', 0, 0), placed('near', 40, 90), placed('ahead', 200, 10)]
    expect(pickNeighborInDirection(nodes, 0, 'right')).toBe(2)
    expect(pickNeighborInDirection(nodes, 0, 'down')).toBe(1)
  })

  it('answers -1 when nothing lies that way, so the selection can stay where it is', () => {
    const nodes = [placed('a', 0, 0), placed('b', 120, 0)]
    expect(pickNeighborInDirection(nodes, 0, 'left')).toBe(-1)
    expect(pickNeighborInDirection(nodes, 0, 'up')).toBe(-1)
    expect(pickNeighborInDirection(nodes, 9, 'right')).toBe(-1)
  })

  it('leaves a node already inside the viewport exactly where it is', () => {
    const state = canvasState()
    ensureNodeVisible(state, placed('inside', 300, 200))
    expect({ x: state.offsetX, y: state.offsetY }).toEqual({ x: 0, y: 0 })
  })

  it('pans just far enough to bring a node back inside, on each edge', () => {
    const right = canvasState()
    ensureNodeVisible(right, placed('right', 900, 200))
    expect(right.offsetX).toBe(-134)
    const left = canvasState()
    ensureNodeVisible(left, placed('left', -900, 200))
    expect(left.offsetX).toBe(934)
    const top = canvasState()
    ensureNodeVisible(top, placed('top', 200, -900))
    expect(top.offsetY).toBe(934)
    const bottom = canvasState()
    ensureNodeVisible(bottom, placed('bottom', 200, 900))
    expect(bottom.offsetY).toBe(-334)
  })

  it('does nothing before the canvas has been measured', () => {
    const state = { ...canvasState(), width: 0, height: 0 }
    ensureNodeVisible(state, placed('far', 5_000, 5_000))
    expect({ x: state.offsetX, y: state.offsetY }).toEqual({ x: 0, y: 0 })
  })
})

function searchNode(
  id: string,
  title: string,
  options: Partial<GraphResponse['nodes'][number]> = {},
): GraphResponse['nodes'][number] {
  return {
    id, title, kind: 'note', degree: 0, inDegree: 0, outDegree: 0,
    folderId: null, folderName: null, folderColor: null, tags: [], ...options,
  }
}

const searched: GraphResponse['nodes'] = [
  searchNode('note-1', 'Quarterly review', { folderName: 'Work', tags: [{ name: 'work', color: null }] }),
  searchNode('note-2', 'Reading list', { folderName: 'Life' }),
  searchNode('tag:work', 'work', { kind: 'tag' }),
]

describe('the nodes a search hit, counted on the canvas rather than by the server (G-14)', () => {
  it('answers nothing at all when there is no search to locate by', () => {
    expect(graphSearchHits(searched, '')).toBeNull()
    expect(graphSearchHits(searched, '   ')).toBeNull()
  })

  it('hits the note whose title carries the words, and leaves the rest out', () => {
    expect(graphSearchHits(searched, 'reading')).toEqual(new Set(['note-2']))
  })

  it('answers an empty set when nothing matches, so the whole field can fade', () => {
    expect(graphSearchHits(searched, 'atlas')).toEqual(new Set())
  })

  it('reads tag: and path: the way the filter line means them, and keeps the tag node of a tag hit', () => {
    expect(graphSearchHits(searched, 'tag:work')).toEqual(new Set(['note-1', 'tag:work']))
    expect(graphSearchHits(searched, 'path:life')).toEqual(new Set(['note-2']))
    expect(graphSearchHits(searched, '-tag:work')).toEqual(new Set(['note-2']))
  })

  it('takes the whole line as one filter, so a word and a qualifier have to hold together', () => {
    expect(graphSearchHits(searched, 'review tag:work')).toEqual(new Set(['note-1']))
    expect(graphSearchHits(searched, 'review tag:none')).toEqual(new Set())
  })
})
