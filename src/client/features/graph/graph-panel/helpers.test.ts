import { beforeEach, describe, expect, it } from 'vitest'
import { GRAPH_PREFS_KEY } from './constants'
import { graphPrefsStorageKey, graphScaleAfterWheel, loadPreferences, nodeColor } from './helpers'

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
