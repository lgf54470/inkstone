import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A `Tooltip` and the control it wraps are the same message, said twice: once in print for a reader who
 * hovers, once as the accessible name for a reader who never sees it. The graph's fit control spent a
 * long time saying `graph.fit` out loud and `graph.reset` in print (G-35) — the two arguments are one
 * prop each, so nothing but a check keeps them from drifting apart again.
 *
 * The tooltip's text only exists in the DOM once the browser has laid the bubble out, which jsdom never
 * does, so this reads the source the mismatch was written in rather than the rendered tree. The
 * companion case in `graph-panel/panel-control-naming.test.ts` asserts the rendered name.
 */
const PANEL_SOURCES = [
  'src/client/features/graph/graph-panel/index.tsx',
  'src/client/features/graph/local-graph.tsx',
]

const PAIRS = /<Tooltip label=\{t\('([a-z_.]+)'\)\}[^>]*>\s*<(?:IconButton|Button)[^>]*label=\{t\('([a-z_.]+)'\)\}/g

describe('a tooltip never names its control something else (G-35)', () => {
  const found = PANEL_SOURCES.flatMap((file) => [...fs.readFileSync(path.resolve(file), 'utf8').matchAll(PAIRS)])

  it('reads the wrapped controls it is supposed to cover', () => {
    // A guard that matches nothing is a guard that was silently deleted; the graph header alone has more
    // than a handful of these pairs.
    expect(found.length).toBeGreaterThanOrEqual(10)
  })

  it('says the same message id on the print and on the name', () => {
    for (const [, tip, name] of found) {
      expect(name).toBe(tip)
    }
  })
})
