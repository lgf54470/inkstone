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
    onSelect: vi.fn(),
    onContextMenu: vi.fn(),
    onMenuButton: vi.fn(),
    onEdit: vi.fn(),
  }
}

async function mount(props: Partial<{ handlers: TrackRowHandlers }> = {}): Promise<{ container: HTMLElement; handlers: TrackRowHandlers }> {
  const rowHandlers = props.handlers ?? handlers()
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicTrackCard, {
      track: card(), index: 0, isCurrent: false, isPlaying: false, isStreamLoading: false, isSelected: false, handlers: rowHandlers,
    }))
  })
  return { container, handlers: rowHandlers }
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
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
