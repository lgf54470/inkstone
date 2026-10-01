import { createElement, type ReactNode, type RefObject } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GraphColorGroup, GraphPreferences } from '../../../lib/graph-settings'
import { renderElement, type RenderedElement } from '../../../lib/test-render'
import { buildInitialLayout } from './canvas-draw'
import { useDynamicGraphPrefs } from './canvas-hooks'
import { DEFAULT_PREFERENCES } from './constants'
import type { CanvasState } from './types'

/**
 * Colour rules are edited while the graph is already on screen, so an edit has to reach the nodes the
 * ticker is drawing. Rebuilding the layout would throw away the dragged positions and the physics run,
 * so a dedicated effect re-stamps the live nodes instead — which is what these cases pin.
 */
const data = {
  nodes: [
    { id: 'note-1', title: 'Quarterly review', kind: 'note' as const, degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderName: 'Work', folderColor: null, tags: [{ name: 'work', color: '#059669' }] },
    { id: 'note-2', title: 'Reading list', kind: 'note' as const, degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderName: 'Life', folderColor: null, tags: [] },
  ],
  edges: [{ source: 'note-1', target: 'note-2' }],
  meta: { mode: 'local' as const, centerId: 'note-1', depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 350 },
}

const workRule: GraphColorGroup = { id: 'r1', query: 'tag:work', color: '#4f46e5' }
const lifeRule: GraphColorGroup = { id: 'r2', query: 'path:life', color: '#ea580c' }

function createState(): CanvasState {
  return {
    nodes: [], edges: [], scale: 1, offsetX: 0, offsetY: 0, width: 800, height: 600,
    dragging: null, pointers: new Map(), pinch: null, frame: 0, raf: 0, schedule: null,
  }
}

function Driver({ stateRef, prefs }: { stateRef: RefObject<CanvasState>, prefs: GraphPreferences }): null {
  useDynamicGraphPrefs(stateRef, prefs)
  return null
}

const mounted: RenderedElement[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
})

function mount(stateRef: RefObject<CanvasState>, colorGroups: GraphColorGroup[]): (next: GraphColorGroup[]) => void {
  const element = (groups: GraphColorGroup[]): ReactNode => createElement(Driver, {
    stateRef,
    prefs: { ...DEFAULT_PREFERENCES, groupBy: 'folder', colorGroups: groups },
  })
  const rendered = renderElement(element(colorGroups))
  mounted.push(rendered)
  return (next: GraphColorGroup[]) => rendered.rerender(element(next))
}

describe('live color rule repaint (FEAT-04)', () => {
  it('repaints the nodes a new rule matches, keeping the positions the reader dragged', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
    })))
    const state = createState()
    buildInitialLayout(data, { ...DEFAULT_PREFERENCES, colorGroups: [workRule] }, state)
    const first = state.nodes[0]!
    const second = state.nodes[1]!
    expect(first.colorGroup).toBe('#4f46e5')
    second.x = 42
    second.y = -17
    const frame = state.frame
    const schedule = vi.fn()
    state.schedule = schedule
    const update = mount({ current: state }, [workRule])

    update([lifeRule])

    expect(state.nodes[0]).toBe(first)
    expect(state.nodes[1]).toBe(second)
    expect(second.x).toBe(42)
    expect(second.y).toBe(-17)
    expect(state.frame).toBe(frame)
    expect(first.colorGroup).toBeNull()
    expect(second.colorGroup).toBe('#ea580c')
    expect(schedule).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('hands the colour back to the grouping when the last rule is removed', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
    })))
    const state = createState()
    buildInitialLayout(data, { ...DEFAULT_PREFERENCES, colorGroups: [workRule] }, state)
    const update = mount({ current: state }, [workRule])

    update([])

    expect(state.nodes.map((node) => node.colorGroup)).toEqual([null, null])
    vi.unstubAllGlobals()
  })
})
