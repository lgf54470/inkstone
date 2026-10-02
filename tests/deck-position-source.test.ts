import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Where a running show is — which slide, and which page of it — is written out by three surfaces: the
 * pill in the toolbar, the chip in the corner of the stage, and the name of every entry in the slide
 * list. They used to each spell it by hand, which is how one page ended up reading `3 / 14` in one
 * place, `03 / 14 (2/4)` in another and `2/4` a third time beside a fraction it could be confused with.
 *
 * `deck-position.ts` is the single derivation. This test is the half of that rule a component test
 * cannot reach: the corner chip lives in a surface whose metrics come from a real layout, so no unit
 * test mounts it — the pairing of the two printed strings is read in the browser instead, in
 * scripts/e2e-visual.mjs (`presentation: the pill and the corner chip print one position`).
 */
const PRESENTATION_ROOT = path.resolve('src/client', 'features', 'presentation')
const SURFACES = [
  'presentation-controls.tsx',
  'presentation-stage.tsx',
  'slide-thumb.tsx',
]

// A fraction built out of two zero-based numbers plus one is a hand-spelled deck position: the shape
// every one of these surfaces used before there was one function to call.
const HAND_SPOKE_POSITION = /\$\{[A-Za-z.]+ \+ 1\} \/ \$\{/

function source(file: string): string {
  return fs.readFileSync(path.join(PRESENTATION_ROOT, file), 'utf8')
}

describe('deck position derivation policy', () => {
  it('is imported by every surface that prints one', () => {
    const offenders = SURFACES.filter((file) => !source(file).includes("from './deck-position'"))
    expect(offenders).toEqual([])
  })

  it('leaves those surfaces no hand-spelled fraction to print', () => {
    const offenders = SURFACES.filter((file) => HAND_SPOKE_POSITION.test(source(file)))
    expect(offenders).toEqual([])
  })
})
