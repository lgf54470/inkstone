import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { initI18n, t } from '../../lib/i18n'
import { MusicTextImportButton } from './music-text-import'
import { useMusic } from './music-store'

beforeAll(async () => {
  await initI18n()
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

function track(id: string, title: string, artist: string): MusicTrack {
  return {
    id, title, artist, album: '', durationMs: 1000, source: 'r2', format: 'mp3', webdavPath: null,
    mime: 'audio/mpeg', sizeBytes: 0, coverUrl: null, lyric: null, hasLyric: false, tagIds: [],
    isFavorite: false, isPinned: false, playCount: 0, lastPlayedAt: null, contentHash: null, createdAt: 1, updatedAt: 1,
  }
}

const tracks = [
  track('s1', 'Sunny Day', 'Jay Chou'),
  track('s2', 'Moonlight', 'Hu Yanbin'),
]

let root: Root | null = null

async function mount(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root?.render(createElement(MusicTextImportButton, { tracks })) })
}

function dialog(): HTMLElement | null {
  return document.querySelector('[role="dialog"]')
}

function buttonIn(scope: Element | null, label: string): HTMLButtonElement | undefined {
  return [...(scope?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.includes(label)) as HTMLButtonElement | undefined
}

function typeInto(field: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  act(() => {
    setter?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  useMusic.setState({
    tracks, tags: [], playlists: [], scope: { kind: 'all' }, query: '', sourceFilter: 'all',
    viewMode: 'list', selectedIds: [], romanized: {}, queue: [], currentIndex: 0,
    addManyToQueue: vi.fn(() => 2),
    createPlaylistWithTracks: vi.fn(async () => true),
  })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

// FEA-B2: a list pasted as plain text answers the same matching the M3U file
// import offers — "artist - title" lines and bare titles both resolve.
describe('the text playlist import (FEA-B2)', () => {
  it('queues the tracks a pasted artist-title list resolves to', async () => {
    await mount()
    await act(async () => { buttonIn(document.body, t('music.import_text'))?.click() })
    typeInto(dialog()?.querySelector('textarea') as HTMLTextAreaElement, 'Jay Chou - Sunny Day\nHu Yanbin - Moonlight\nNobody - Missing Song')
    await act(async () => { buttonIn(dialog(), t('music.import_text_queue'))?.click() })
    expect(useMusic.getState().addManyToQueue).toHaveBeenCalledWith(['s1', 's2'])
  })

  it('saves the resolved tracks as a new playlist when a name is given', async () => {
    await mount()
    await act(async () => { buttonIn(document.body, t('music.import_text'))?.click() })
    typeInto(dialog()?.querySelector('textarea') as HTMLTextAreaElement, 'Jay Chou - Sunny Day\nHu Yanbin - Moonlight')
    const nameField = dialog()?.querySelector('input') as HTMLInputElement
    const nameSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    act(() => {
      nameSetter?.call(nameField, 'My List')
      nameField.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { buttonIn(dialog(), t('music.import_text_playlist'))?.click() })
    expect(useMusic.getState().createPlaylistWithTracks).toHaveBeenCalledWith('My List', ['s1', 's2'])
  })
})
