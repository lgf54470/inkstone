import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicPlaylistDetail, MusicTrack } from '@shared/types'
import { MusicHubPlaylists } from './music-hub-playlists'
import { useMusic } from './music-store'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null

async function mount(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicHubPlaylists, { onCreate: () => {} }))
  })
}

function rowButton(name: string): HTMLButtonElement {
  return [...document.querySelectorAll('button')].find((button) => button.textContent === name) as HTMLButtonElement
}

function coverTrack(id: string, coverUrl: string | null): MusicTrack {
  return { id, title: id, coverUrl } as unknown as MusicTrack
}

function playlist(id: string, name: string, trackIds: string[]): MusicPlaylistDetail {
  return {
    id, name, description: '', isPinned: false, isFavorite: false, trackCount: trackIds.length,
    items: trackIds.map((trackId, index) => ({ id: `${id}-${index}`, playlistId: id, trackId, sortOrder: index })),
  } as unknown as MusicPlaylistDetail
}

beforeEach(() => {
  useMusic.setState({
    tracks: [coverTrack('t1', '/covers/t1.png'), coverTrack('t2', null)],
    tags: [],
    playlists: [playlist('p1', 'Road Trip', ['t2', 't1']), playlist('p2', 'Silent', ['t2'])],
    scope: { kind: 'all' },
    query: '',
    romanized: {},
    queue: [],
    currentIndex: 0,
    setScope: vi.fn(),
    playCollection: vi.fn(async () => {}),
    renamePlaylist: vi.fn(async () => {}),
    deletePlaylist: vi.fn(async () => {}),
  })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

describe('playlist row covers (M-51)', () => {
  it('draws the derived cover of the first covered item', async () => {
    await mount()
    const img = rowButton('Road Trip').querySelector('img')
    expect(img?.getAttribute('src')).toBe('/covers/t1.png')
  })

  it('keeps the icon fallback when no item carries a cover', async () => {
    await mount()
    expect(rowButton('Silent').querySelector('img')).toBeNull()
  })

  it('the cover does not steal the row button name or its click', async () => {
    await mount()
    expect(rowButton('Road Trip')?.getAttribute('aria-label')).toBeNull()
    await act(async () => { rowButton('Road Trip').click() })
    expect(useMusic.getState().setScope).toHaveBeenCalledWith({ kind: 'playlist', playlistId: 'p1' })
  })
})
