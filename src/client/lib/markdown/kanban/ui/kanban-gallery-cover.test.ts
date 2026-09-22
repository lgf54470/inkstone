/**
 * The gallery is a scrolling grid of cards whose covers are full-size files stored per card, so a
 * board with fifty image cards used to ask the browser for fifty downloads the moment it painted the
 * first row. These cases pin the two attributes that make the grid load what the reader can reach —
 * the same pair `lib/markdown/renderer/media.ts` sets for images in a note body — and keep the
 * no-image case rendering a placeholder rather than an `<img>`, so the assertions cannot pass on a
 * grid that simply never drew a cover.
 *
 * A cover is a URL out of the same untrusted document the prose images come from, so it answers the
 * same question the prose renderer asks: a cover on another origin is painted as the blocked
 * placeholder while the account has external images off, and no image on the board — blocked or not —
 * hands the page it lives on to whoever serves it.
 */
import { createElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../i18n'
import { installTestGlobals, renderElement } from '../../../test-render'
import { useSession } from '../../../../store/session'
import { KanbanGalleryView } from './kanban-gallery-view'
import type { KanbanData, KanbanItem } from '../types'

beforeAll(async () => {
  installTestGlobals()
  await initI18n()
})

const rendered: { unmount: () => void }[] = []

afterEach(() => {
  while (rendered.length)
    rendered.pop()!.unmount()
  setExternalImages(false)
})

function setExternalImages(allowed: boolean): void {
  useSession.setState((state) => ({
    settings: { ...state.settings, preview: { ...state.settings.preview, externalImages: allowed } },
  }))
}

function galleryWith(items: KanbanItem[]): HTMLElement {
  const data: KanbanData = {
    columns: [{ id: 'status', name: 'Status', type: 'select', options: [{ id: 'todo', label: 'To Do', color: 'gray' }] }],
    items,
    views: [{ id: 'v-gallery', name: 'Gallery', type: 'gallery', groupBy: 'status' }],
  }
  const view = renderElement(createElement(KanbanGalleryView, {
    data,
    selectedIds: new Set<string>(),
    onToggleSelect: vi.fn(),
    onOpenDetail: vi.fn(),
    onAddItem: vi.fn(),
  }))
  rendered.push(view)
  return view.container
}

function itemWith(overrides: Partial<KanbanItem>): KanbanItem {
  return { id: overrides.id ?? 'card', title: 'Cover card', properties: { status: 'todo' }, ...overrides }
}

describe('kanban gallery cover loading', () => {
  it('defers a set cover until the card is near the viewport', () => {
    const image = galleryWith([itemWith({ cover: '/api/kanban/file/default/a.png' })])
      .querySelector('img')
    expect(image, 'the card has a cover but no image was rendered').not.toBeNull()
    expect(image!.getAttribute('loading')).toBe('lazy')
    expect(image!.getAttribute('decoding')).toBe('async')
    expect(image!.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it('defers the cover picked off the card’s files just the same', () => {
    const image = galleryWith([itemWith({ files: [{ id: 'f1', name: 'shot.jpg', size: 2048, mime: 'image/jpeg', url: '/api/kanban/file/default/b.jpg' }] })])
      .querySelector('img')
    expect(image, 'an image file is the cover but no image was rendered').not.toBeNull()
    expect(image!.getAttribute('loading')).toBe('lazy')
    expect(image!.getAttribute('decoding')).toBe('async')
  })

  it('draws a placeholder in place of a cover on another origin, and says why', () => {
    const grid = galleryWith([itemWith({ cover: 'https://tracker.example.test/pixel.png' })])
    expect(grid.querySelector('img'), 'a blocked cover was still requested').toBeNull()
    expect(grid.textContent).toContain(t('markdown.external_image_blocked'))
  })

  it('requests that cover once the account allows external images, without a referrer', () => {
    setExternalImages(true)
    const image = galleryWith([itemWith({ cover: 'https://tracker.example.test/pixel.png' })])
      .querySelector('img')
    expect(image, 'the account allowed external images but the cover stayed blocked').not.toBeNull()
    expect(image!.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it('leaves a same-origin cover alone whatever the account allows', () => {
    const grid = galleryWith([itemWith({ cover: '/api/kanban/file/default/self.png' })])
    expect(grid.querySelector('img')).not.toBeNull()
    expect(grid.textContent).not.toContain(t('markdown.external_image_blocked'))
  })

  it('keeps a card without an image free of both an img element and a blocked notice', () => {
    const grid = galleryWith([itemWith({ title: 'Text only' })])
    expect(grid.querySelector('img')).toBeNull()
    expect(grid.textContent).not.toContain(t('markdown.external_image_blocked'))
  })

  it('keeps a card without any image free of an img element', () => {
    const grid = galleryWith([itemWith({ title: 'Text only' })])
    expect(grid.querySelector('img')).toBeNull()
    expect(grid.textContent).toContain('Text only')
  })
})
