import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { t } from '../../lib/i18n'
import { MusicGroupBrowse, MusicGroupDetailHeader } from './music-group-browse'
import { MusicHubSidebar } from './music-hub-sidebar'
import { useMusic } from './music-store'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null

async function mount(element: React.ReactElement): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(element)
  })
}

function groupTrack(id: string, artist: string, album: string): MusicTrack {
  return { id, title: id, artist, album, coverUrl: null, durationMs: 100, tagIds: [] } as unknown as MusicTrack
}

function buttonsWithName(label: string): HTMLButtonElement[] {
  return [...document.querySelectorAll('button')].filter((button) => button.textContent?.includes(label)) as HTMLButtonElement[]
}

beforeEach(() => {
  useMusic.setState({
    tracks: [groupTrack('a', 'Ann', 'Fog'), groupTrack('b', 'Ann', 'Spark'), groupTrack('c', 'Zoe', 'Fog')],
    tags: [],
    playlists: [],
    scope: { kind: 'albums' },
    query: '',
    sort: 'title',
    sortDirection: 'asc',
    sourceFilter: 'all',
    selectedIds: [],
    romanized: {},
    loading: false,
    loadError: null,
    queue: [],
    currentIndex: 0,
    setScope: vi.fn(),
    playCollection: vi.fn(async () => {}),
  })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

describe('MusicGroupBrowse grid', () => {
  it('lists album cards named by album with the artist as subtitle', async () => {
    await mount(createElement(MusicGroupBrowse, { kind: 'albums' }))
    const cards = buttonsWithName('Fog')
    expect(cards).toHaveLength(2)
    expect(cards[0]?.textContent).toContain('Ann')
    expect(cards[1]?.textContent).toContain('Zoe')
  })

  it('opens the group detail scope when a card is clicked', async () => {
    await mount(createElement(MusicGroupBrowse, { kind: 'albums' }))
    await act(async () => { buttonsWithName('Spark')[0]?.click() })
    expect(useMusic.getState().setScope).toHaveBeenCalledWith({ kind: 'album', artist: 'Ann', album: 'Spark' })
  })

  it('filters groups by the search query and shows the empty state on a miss', async () => {
    useMusic.setState({ query: 'zoe' })
    await mount(createElement(MusicGroupBrowse, { kind: 'albums' }))
    expect(buttonsWithName('Fog')).toHaveLength(1)
    expect(buttonsWithName('Spark')).toHaveLength(0)
    act(() => root?.unmount())
    root = null
    document.body.innerHTML = ''
    useMusic.setState({ query: 'nobody' })
    await mount(createElement(MusicGroupBrowse, { kind: 'albums' }))
    expect(document.body.textContent).toContain(t('music.no_results'))
  })

  it('shows the loading state instead of an empty grid while the library is on its way', async () => {
    useMusic.setState({ tracks: [], loading: true })
    await mount(createElement(MusicGroupBrowse, { kind: 'albums' }))
    expect(document.querySelector('[role="status"]')).not.toBeNull()
    expect(document.body.textContent).not.toContain(t('music.no_tracks'))
  })

  it('honours the source filter when building groups', async () => {
    useMusic.setState({
      tracks: [
        { ...groupTrack('a', 'Ann', 'Fog'), source: 'r2' },
        { ...groupTrack('b', 'Zoe', 'Spark'), source: 'webdav' },
      ],
      sourceFilter: 'r2',
    })
    await mount(createElement(MusicGroupBrowse, { kind: 'albums' }))
    expect(buttonsWithName('Fog')).toHaveLength(1)
    expect(buttonsWithName('Spark')).toHaveLength(0)
  })
})

describe('MusicGroupDetailHeader', () => {
  it('goes back to the browse grid and shows the group tracks', async () => {
    const group = [groupTrack('a', 'Ann', 'Fog')]
    useMusic.setState({ scope: { kind: 'album', artist: 'Ann', album: 'Fog' } })
    await mount(createElement(MusicGroupDetailHeader, { scope: { kind: 'album', artist: 'Ann', album: 'Fog' }, tracks: group }))
    expect(document.body.textContent).toContain('Fog')
    expect(document.body.textContent).toContain('Ann')
    const back = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === t('music.group_back'))
    await act(async () => { back?.click() })
    expect(useMusic.getState().setScope).toHaveBeenCalledWith({ kind: 'albums' })
  })

  it('plays every track of the group through play-all', async () => {
    const group = [groupTrack('a', 'Ann', 'Fog'), groupTrack('b', 'Ann', 'Spark')]
    useMusic.setState({ scope: { kind: 'artist', artist: 'Ann' } })
    await mount(createElement(MusicGroupDetailHeader, { scope: { kind: 'artist', artist: 'Ann' }, tracks: group }))
    const play = buttonsWithName(t('music.play_all'))[0]
    expect(play?.disabled).toBe(false)
    await act(async () => { play?.click() })
    expect(useMusic.getState().playCollection).toHaveBeenCalledWith(['a', 'b'])
  })

  it('disables play-all for an empty group', async () => {
    useMusic.setState({ tracks: [] })
    await mount(createElement(MusicGroupDetailHeader, { scope: { kind: 'artist', artist: 'Ghost' }, tracks: [] }))
    expect(buttonsWithName(t('music.play_all'))[0]?.disabled).toBe(true)
  })
})

describe('sidebar browse entries — M-50', () => {
  beforeEach(() => {
    useMusic.setState({
      stats: {
        trackCount: 3, favoriteCount: 0, pinnedCount: 0, playlistCount: 0, tagCount: 0,
        totalBytes: 0, totalDurationMs: 300,
      },
    })
  })

  function mountSidebar() {
    return mount(createElement(MusicHubSidebar, { onManageTags: () => {}, onCreatePlaylist: () => {} }))
  }

  it('counts albums and artists from the library', async () => {
    await mountSidebar()
    const albums = buttonsWithName(t('music.albums'))[0]
    expect(albums?.textContent).toContain('3')
    expect(buttonsWithName(t('music.artists'))[0]?.textContent).toContain('2')
  })

  it('opens the grouped grid when the entry is clicked', async () => {
    await mountSidebar()
    await act(async () => { buttonsWithName(t('music.artists'))[0]?.click() })
    expect(useMusic.getState().setScope).toHaveBeenCalledWith({ kind: 'artists' })
  })

  it('keeps the owning browse entry active while drilled into a group', async () => {
    useMusic.setState({ scope: { kind: 'album', artist: 'Ann', album: 'Fog' } })
    await mountSidebar()
    expect(buttonsWithName(t('music.albums'))[0]?.getAttribute('aria-current')).toBe('true')
    expect(buttonsWithName(t('music.artists'))[0]?.getAttribute('aria-current')).toBeNull()
  })
})
