import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The bar under the show counts the pages the deck measures, not the slides the author wrote (N-21).
 * A slide only paginates once something has laid it out, and jsdom lays nothing out — so the
 * composition that turns a measured plan into a page number is read where it is written, the same way
 * the deck-position derivation is. The arithmetic itself lives in `deckProgress`, tested in
 * `presentation-state.test.ts`; what is pinned here is that the surfaces actually go through it.
 */
const PRESENTATION_ROOT = path.resolve('src/client', 'features', 'presentation')

function source(file: string): string {
  return fs.readFileSync(path.join(PRESENTATION_ROOT, file), 'utf8')
}

describe('slide progress derivation policy', () => {
  it('derives the bar from the page list the show measures', () => {
    const session = source('use-presentation-session.ts')
    expect(session).toMatch(/\.\.\.deckProgress\(\{ deckLength: deck\.length, plans: nav\.plans, index: nav\.index, sub: nav\.sub \}\),/)
    expect(session).not.toMatch(/page: (deck\.length|nav\.index)/)
  })

  it('hands those two numbers to the bar and nothing else', () => {
    expect(source('presentation-overlay.tsx')).toMatch(/<SlideProgress page=\{session\.page\} pageTotal=\{session\.pageTotal\} \/>/)
  })

  it('leaves the bar no prop its only caller never passes', () => {
    expect(source('presentation-controls.tsx')).not.toMatch(/function SlideProgress\([^)]*chromeHidden/)
  })
})
