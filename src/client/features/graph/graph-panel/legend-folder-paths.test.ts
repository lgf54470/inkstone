import { describe, expect, it } from 'vitest'
import { buildColorLegends, graphSearchHits } from './helpers'
import type { CanvasNode } from './types'

/**
 * A nested vault can hold two folders that end with the same word, and both a legend row and the `path:`
 * term it hands back name a folder. If either of them used only the last word, the two folders would be
 * one row pointing at both — so the row says the whole path and the term selects exactly that folder
 * (G-48). The path itself arrives on the node, worked out by the same code the route filtered with.
 */
const inFolder = (id: string, folderId: string | null, folderPath: string | null, folderColor: string | null): CanvasNode => ({
  id,
  title: `Note ${id}`,
  kind: 'note',
  degree: 1,
  inDegree: 1,
  outDegree: 0,
  folderId,
  folderPath,
  folderColor,
  tags: [],
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  r: 4,
  tagColor: null,
  colorGroup: null,
})

describe('a folder group named by where it sits (G-48)', () => {
  it('keeps two folders that end with the same word as two rows, each selecting only its own notes', () => {
    const nodes = [
      inFolder('a', 'wn', 'Work/Notes', '#dc2626'),
      inFolder('b', 'ln', 'Life/Notes', '#059669'),
    ]

    const rows = buildColorLegends(nodes, 'folder')
    expect(rows.map((row) => row.label)).toEqual(['Work/Notes', 'Life/Notes'])
    expect(graphSearchHits(nodes, rows[0]!.query)).toEqual(new Set(['a']))
    expect(graphSearchHits(nodes, rows[1]!.query)).toEqual(new Set(['b']))
  })

  it('quotes a path a space would otherwise split in the filter line', () => {
    const nodes = [inFolder('a', 'rn', 'Reading Room/Notes', '#dc2626')]

    const [row] = buildColorLegends(nodes, 'folder')
    expect(row?.query).toBe('path:"Reading Room/Notes"')
    expect(graphSearchHits(nodes, row!.query)).toEqual(new Set(['a']))
  })

  it('offers no folder row to a note that sits in no folder', () => {
    expect(buildColorLegends([inFolder('a', null, null, '#dc2626')], 'folder')).toEqual([])
  })

  it('selects the subtree a path opens, because a path says everything above it too', () => {
    const nodes = [
      inFolder('a', 'wn', 'Work/Notes', '#dc2626'),
      inFolder('b', 'w', 'Work', '#dc2626'),
      inFolder('c', 'ln', 'Life/Notes', '#059669'),
    ]

    expect(graphSearchHits(nodes, 'path:Work')).toEqual(new Set(['a', 'b']))
    expect(graphSearchHits(nodes, 'path:Work/Notes')).toEqual(new Set(['a']))
  })
})
