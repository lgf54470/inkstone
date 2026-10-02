/**
 * Preparing a page means running its diagrams, math and embeds into the markup the projector will
 * actually show. When that chain throws, the page is still readable — the plain markup is already
 * cached — but every rich block on it stays a placeholder, and until now nothing said so: the
 * rejection vanished into the microtask queue and the presenter stood next to a formula skeleton
 * with no way to tell "slow" from "this one failed".
 */
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement, type RenderedElement } from '../../lib/test-render'
import { createFenceBodies } from '../../lib/markdown/fence-bodies'
import { hashContent, readSlideHtml, rememberSlideHtml, slideCacheKey } from './slide-html'

vi.mock('../../lib/markdown/enhance', () => ({
  enhancePreview: vi.fn(async () => {
    throw new Error('a diagram blew up')
  }),
}))

vi.mock('../../lib/markdown/embeds', () => ({
  resolveNoteEmbeds: vi.fn(async () => {}),
}))

const { useSlideHtml } = await import('./use-slide-html')

const DECK = ['# Opening\n\nSome text', '# Second\n\nMore text']
const metrics = { contentWidth: 1120, contentHeight: 630, designWidth: 1280, designHeight: 720, scale: 1 }

function Host({ index }: { index: number }) {
  const failed = useSlideHtml({
    open: true,
    deck: DECK,
    index,
    fingerprint: hashContent(DECK[index]),
    content: DECK.join('\n\n---\n\n'),
    noteTitle: 'Talk',
    dark: false,
    metrics,
  })
  return createElement('span', { 'data-failed': String(failed) })
}

let warnings: unknown[][] = []

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  warnings = []
  vi.spyOn(console, 'warn').mockImplementation((...rest: unknown[]) => { warnings.push(rest) })
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function keyFor(index: number): string {
  return slideCacheKey({ fingerprint: hashContent(DECK[index]), dark: false, index, contentWidth: metrics.contentWidth, contentHeight: metrics.contentHeight })
}

describe('useSlideHtml — when a page cannot be prepared', () => {
  it('warns with context instead of dropping the rejection', async () => {
    const view: RenderedElement = renderElement(createElement(Host, { index: 0 }))
    await settle()

    expect(warnings.length).toBe(1)
    expect(String(warnings[0]?.[0])).toContain('[inkstone] slide preparation failed')
    view.unmount()
  })

  it('reports the page it could not prepare and not the one that came through', async () => {
    // The second page is seeded as already prepared, so its effect has nothing to run: a report that
    // named every page would call this one broken too, and that is the difference between a notice
    // and an alarm.
    rememberSlideHtml(keyFor(1), { html: '<p>More text</p>', fences: createFenceBodies() })

    const prepared: RenderedElement = renderElement(createElement(Host, { index: 1 }))
    await settle()
    expect(prepared.container.querySelector('span')?.getAttribute('data-failed')).toBe('false')
    prepared.unmount()

    const broken: RenderedElement = renderElement(createElement(Host, { index: 0 }))
    await settle()
    expect(broken.container.querySelector('span')?.getAttribute('data-failed')).toBe('true')
    broken.unmount()
  })

  // The plain markup is written before the enhancement runs, so a failed page still carries its text;
  // the failure rides along beside it, which is what lets the slide list and the projector agree.
  it('leaves the readable markup in the cache with the failure marked on it', async () => {
    const view: RenderedElement = renderElement(createElement(Host, { index: 0 }))
    await settle()

    const entry = readSlideHtml(keyFor(0))
    expect(entry?.failed).toBe(true)
    expect(entry?.html).toContain('Some text')
    view.unmount()
  })
})
