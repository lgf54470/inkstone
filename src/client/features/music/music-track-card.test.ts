import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { t } from '../../lib/i18n'
import { MusicTrackCard } from './music-track-card'
import type { TrackRowHandlers } from './music-track-row'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null

function card(): MusicTrack {
  return {
    id: 'track-1', title: 'Moonlight', artist: 'Hu Yanbin', album: 'Answer',
    durationMs: 200_000, source: 'r2', format: 'mp3', webdavPath: null, mime: 'audio/mpeg',
    sizeBytes: 1024, coverUrl: null, lyric: null, hasLyric: false, tagIds: [],
    isFavorite: false, isPinned: false, playCount: 0, lastPlayedAt: null, contentHash: null,
    createdAt: 0, updatedAt: 0,
  }
}

function handlers(): TrackRowHandlers {
  return {
    onPlay: vi.fn(),
    onToggleFavorite: vi.fn(),
    onTogglePin: vi.fn(),
    onSelect: vi.fn(),
    onContextMenu: vi.fn(),
    onMenuButton: vi.fn(),
  }
}

async function mount(props: Partial<{ handlers: TrackRowHandlers; track: MusicTrack }> = {}): Promise<{ container: HTMLElement; handlers: TrackRowHandlers }> {
  const rowHandlers = props.handlers ?? handlers()
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicTrackCard, {
      track: props.track ?? card(), index: 0, isCurrent: false, isPlaying: false, isStreamLoading: false, isSelected: false, handlers: rowHandlers,
    }))
  })
  return { container, handlers: rowHandlers }
}

// The card's actions used to be the favourite and the menu; a pinned row is a state the card could
// only show in its info line. The control now sits with the favourite, and reports its own state the
// way the immersive player's does — `aria-pressed`, not only a filled glyph.
describe('the card offers pinning beside the favourite', () => {
  function actionControl(container: HTMLElement, label: string): HTMLButtonElement | undefined {
    return [...container.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === label)
  }

  it('presses to pin, and says it is not pinned yet', async () => {
    const { container, handlers: rowHandlers } = await mount()
    const pin = actionControl(container, t('music.pin'))
    expect(pin).toBeDefined()
    expect(pin?.getAttribute('aria-pressed')).toBe('false')
    await act(async () => { pin?.click() })
    expect(rowHandlers.onTogglePin).toHaveBeenCalledTimes(1)
    expect(rowHandlers.onToggleFavorite).not.toHaveBeenCalled()
  })

  it('reads the pinned card as pressed, and offers the way out', async () => {
    const { container } = await mount({ track: { ...card(), isPinned: true } })
    const pin = actionControl(container, t('music.unpin'))
    expect(pin).toBeDefined()
    expect(pin?.getAttribute('aria-pressed')).toBe('true')
  })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

// FB2-C3: the length pill sits on the artwork, and a translucent scrim over a picture is a background
// nothing can judge — axe reads it as "the element contains an image node" and the contrast gate's
// verdict then depends on whether the instance's library happened to hold a cover. An opaque token is
// the pill's own background, so the pair is measurable whatever the picture is.
describe('the length pill carries its own background (FB2-C3)', () => {
  it('paints the pill with an opaque token rather than the artwork scrim', async () => {
    const { container } = await mount()
    const pill = [...container.querySelectorAll('span')]
      .find((span) => span.textContent?.trim() === '03:20')
    expect(pill).toBeDefined()
    expect(pill?.className).toContain('bg-[var(--bg-overlay)]')
    expect(pill?.className).not.toContain('bg-[var(--scrim)]')
  })
})

// The grid card used to be a bare div that selected on click and played on double click: no role,
// no keyboard path, and a container that swallowed clicks meant for its own controls.
describe('the grid card is a named container, not a click surface', () => {
  it('announces itself as a group for one track', async () => {
    const { container } = await mount()
    const card = container.firstElementChild as HTMLElement
    expect(card.getAttribute('role')).toBe('group')
    expect(card.getAttribute('aria-label')).toBe('Moonlight')
  })

  it('leaves selecting to the checkbox and playing to the artwork button', async () => {
    const { container, handlers: rowHandlers } = await mount()
    const card = container.firstElementChild as HTMLElement
    await act(async () => { card.click() })
    expect(rowHandlers.onSelect).not.toHaveBeenCalled()

    await act(async () => {
      (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click()
    })
    expect(rowHandlers.onSelect).toHaveBeenCalledTimes(1)

    await act(async () => {
      (container.querySelector('button') as HTMLButtonElement).click()
    })
    expect(rowHandlers.onPlay).toHaveBeenCalledTimes(1)
  })

  it('still opens the track menu from the card controls', async () => {
    const { container, handlers: rowHandlers } = await mount()
    const menu = [...container.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === t('music.open_menu')) as HTMLButtonElement
    await act(async () => { menu.click() })
    expect(rowHandlers.onMenuButton).toHaveBeenCalledTimes(1)
  })
})
