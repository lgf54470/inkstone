/**
 * Which export a press asks for, and what the show therefore holds.
 *
 * Both exports read the same pages, so the kind has to be part of what is held: holding the pages alone
 * would mount the printed deck and the handout at the same time and print two sheets for one press.
 * The handout adds the second half of that contract — a sheet the speaker reads has to carry the
 * notes, and the notes are indexed by slide, not by printed page (N-32).
 */
import { act, createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { createFenceBodies } from '../../lib/markdown/fence-bodies'
import { useDeckExport, type DeckExportOptions } from './deck-export'
import { clearSlideHtmlCache, rememberSlideHtml, slideCacheKey } from './slide-html'
import type { StageMetrics } from './slide-stage'

vi.mock('./deck-image', () => ({
  deckImageGeometry: vi.fn(() => ({ width: 1280, height: 720, padX: 0, padY: 0 })),
  collectDeckCss: vi.fn(async () => ''),
  renderDeckPagePng: vi.fn(async () => new Blob(['fake-png'], { type: 'image/png' })),
  zipDeckImages: vi.fn(async () => new Blob(['fake-zip'], { type: 'application/zip' })),
  saveDeckImages: vi.fn(),
}))
vi.mock('../../store/ui', () => ({ useUi: { getState: () => ({ toast: vi.fn() }) } }))

const METRICS: StageMetrics = { scale: 1, designWidth: 1280, designHeight: 720, contentWidth: 1168, contentHeight: 632 }
const DECK = ['One page of talk.', 'Another page of talk.']
const NOTES = ['Say the plan.', 'Then thank everyone.']
const KEYS = DECK.map((text, index) => slideCacheKey({ fingerprint: text, dark: false, index, contentWidth: METRICS.contentWidth, contentHeight: METRICS.contentHeight }))

function options(overrides: Partial<DeckExportOptions> = {}): DeckExportOptions {
  return {
    deck: DECK,
    cacheKeys: KEYS,
    plans: {},
    metrics: METRICS,
    externalImages: false,
    dark: false,
    title: 'Release plan',
    notes: NOTES,
    ...overrides,
  }
}

function mountExports(overrides: Partial<DeckExportOptions> = {}) {
  let held: ReturnType<typeof useDeckExport> | null = null
  function Probe() {
    held = useDeckExport(options(overrides))
    return null
  }
  const view = renderElement(createElement(Probe))
  return {
    get exports() {
      if (!held) throw new Error('the export hook never mounted')
      return held
    },
    unmount: () => view.unmount(),
  }
}

describe('useDeckExport — one press holds one sheet', () => {
  it('holds the handout with the notes the speaker wrote, and no other sheet', () => {
    clearSlideHtmlCache()
    DECK.forEach((_, index) => rememberSlideHtml(KEYS[index], { html: `<p>${index}</p>`, fences: createFenceBodies() }))
    const show = mountExports()
    try {
      act(() => { show.exports.exportHandout() })
      expect(show.exports.handout?.notes).toEqual(NOTES)
      expect(show.exports.handout?.pages).toHaveLength(2)
      expect(show.exports.print).toBeNull()
      expect(show.exports.images).toBeNull()
    } finally {
      show.unmount()
    }
  })

  it('keeps the printed deck and the handout from being mounted for one another', () => {
    clearSlideHtmlCache()
    DECK.forEach((_, index) => rememberSlideHtml(KEYS[index], { html: `<p>${index}</p>`, fences: createFenceBodies() }))
    const show = mountExports()
    try {
      act(() => { show.exports.exportDeck() })
      expect(show.exports.print?.pages).toHaveLength(2)
      expect(show.exports.handout).toBeNull()
      act(() => { show.exports.print?.done() })
      act(() => { show.exports.exportHandout() })
      expect(show.exports.handout?.pages).toHaveLength(2)
      expect(show.exports.print).toBeNull()
    } finally {
      show.unmount()
    }
  })

  it('hands the handout back to the show once it is printed', () => {
    clearSlideHtmlCache()
    DECK.forEach((_, index) => rememberSlideHtml(KEYS[index], { html: `<p>${index}</p>`, fences: createFenceBodies() }))
    const show = mountExports()
    try {
      act(() => { show.exports.exportHandout() })
      act(() => { show.exports.handout?.done() })
      expect(show.exports.handout).toBeNull()
    } finally {
      show.unmount()
    }
  })
})
