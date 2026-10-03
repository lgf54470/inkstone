import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The companion graph's way out is a one-shot ask, and both ends of it are lines nobody presses in a
 * jsdom test: the workspace decides what the header button means, and the panel decides whether to honour
 * the ask. `companion-open-local.test.ts` mounts the real panel with the ask already set, so the two
 * halves each have an owner here (G-48).
 */
const WIRING = [
  'src/client/features/workspace/workspace/workspace-views.tsx',
  'src/client/features/graph/graph-panel/index.tsx',
  'src/client/features/graph/graph-panel/use-graph-prefs.ts',
]

function source(file: string): string {
  return fs.readFileSync(path.resolve(file), 'utf8')
}

function lineOf(file: string, marker: string): string {
  const line = source(file).split('\n').find((entry) => entry.includes(marker))
  if (!line) throw new Error(`${file} no longer mentions ${marker}`)
  return line
}

describe('the note-centred ask is wired at both ends (G-48)', () => {
  it('reads the three files that own the ask', () => {
    for (const file of WIRING) expect(fs.existsSync(path.resolve(file))).toBe(true)
  })

  it('opens the full graph around the note rather than on whatever mode was stored', () => {
    const line = lineOf(WIRING[0], 'onOpenFullGraph=')
    expect(line).toContain('openGraphAroundNote()')
    expect(line).not.toContain("openPanel('graph')")
  })

  it('honours the ask in the panel and spends it where it was set', () => {
    expect(lineOf(WIRING[1], 'useGraphAroundNoteRequest(')).toContain('setPrefs')
    const honoured = source(WIRING[2])
    expect(honoured).toContain('useUi.setState({ graphLocalRequested: false })')
    expect(honoured).toMatch(/setPrefs\(\(current\) => current\.mode === 'local'/)
  })
})
