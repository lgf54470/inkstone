import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicPlaylistDetail, MusicTrack } from '@shared/types'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { MusicHubPlaylists } from './music-hub-playlists'
import { useMusic } from './music-store'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

function stubClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}

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

function menuAnchor(index: number): HTMLButtonElement {
  return [...document.querySelectorAll('button')].filter((button) => button.getAttribute('aria-label') === t('music.open_menu'))[index]!
}

function namedButton(name: string): HTMLButtonElement {
  return document.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement
}

function menuItem(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('[role="menu"] [role="menuitem"]')]
    .find((item) => item.textContent?.includes(label)) as HTMLButtonElement | undefined
}

async function openMenu(index: number): Promise<void> {
  await act(async () => { menuAnchor(index).click() })
}

async function clickItem(label: string): Promise<void> {
  const item = menuItem(label)
  expect(item, `menu item ${label}`).toBeDefined()
  await act(async () => { item!.click() })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}

function coverTrack(id: string, coverUrl: string | null): MusicTrack {
  return { id, title: id, coverUrl } as unknown as MusicTrack
}

function playlist(id: string, name: string, trackIds: string[], shareSlug: string | null = null): MusicPlaylistDetail {
  return {
    id, name, description: '', isPinned: false, isFavorite: false, shareSlug, trackCount: trackIds.length,
    items: trackIds.map((trackId, index) => ({ id: `${id}-${index}`, playlistId: id, trackId, sortOrder: index })),
  } as unknown as MusicPlaylistDetail
}

beforeEach(() => {
  useUi.setState({ toasts: [] })
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
    renamePlaylist: vi.fn(async () => true),
    deletePlaylist: vi.fn(async () => {}),
    sharePlaylist: vi.fn(async () => 'share-slug-1'),
    unsharePlaylist: vi.fn(async () => {}),
  })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else delete (navigator as unknown as Record<string, unknown>).clipboard
  vi.restoreAllMocks()
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

// Hover is not a thing on a touch screen, and a control painted at zero opacity still takes the
// tap that would have revealed it — so the row menu and the new-playlist button were, on a phone,
// the only way to rename, share or delete a playlist and also the thing hiding them. The track
// rows already solve this by revealing from `md` up instead of hiding until hover; these two are
// the hub's last holdouts.
describe('playlist controls are reachable without a pointer', () => {
  it('shows each row menu before anyone hovers', async () => {
    await mount()
    expect(menuAnchor(0).classList.contains('opacity-0')).toBe(false)
    expect(menuAnchor(0).classList.contains('md:opacity-0')).toBe(true)
  })

  it('shows the new-playlist button before anyone hovers', async () => {
    await mount()
    const create = namedButton(t('music.new_playlist'))
    expect(create.classList.contains('opacity-0')).toBe(false)
    expect(create.classList.contains('md:opacity-0')).toBe(true)
  })
})

describe('playlist share menu (M-51)', () => {
  it('sharing an unshared playlist copies the anonymous link and says so', async () => {
    const writeText = vi.fn(async () => {})
    stubClipboard({ writeText })
    await mount()
    await openMenu(0)
    expect(menuItem(t('music.share_playlist'))).toBeDefined()
    expect(menuItem(t('music.unshare_playlist'))).toBeUndefined()
    await clickItem(t('music.share_playlist'))
    expect(useMusic.getState().sharePlaylist).toHaveBeenCalledWith('p1')
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/playlist/share-slug-1`)
    expect(useUi.getState().toasts.map((toast) => toast.title)).toEqual([t('music.share_link_copied')])
  })

  it('an already-shared playlist offers stop-sharing and never the copy path', async () => {
    useMusic.setState({ playlists: [playlist('p1', 'Road Trip', ['t1'], 'old-slug')] })
    const writeText = vi.fn(async () => {})
    stubClipboard({ writeText })
    await mount()
    await openMenu(0)
    expect(menuItem(t('music.share_playlist'))).toBeUndefined()
    await clickItem(t('music.unshare_playlist'))
    expect(useMusic.getState().unsharePlaylist).toHaveBeenCalledWith('p1')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('a refused clipboard reports the failed copy instead of staying silent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    stubClipboard({ writeText: vi.fn(async () => { throw new Error('denied') }) })
    await mount()
    await openMenu(0)
    await clickItem(t('music.share_playlist'))
    expect(useUi.getState().toasts.map((toast) => toast.title)).toEqual([t('music.share_link_copy_failed')])
    expect(warn).toHaveBeenCalled()
  })

  it('a browser without the clipboard API is reported too', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    stubClipboard(undefined)
    await mount()
    await openMenu(0)
    await clickItem(t('music.share_playlist'))
    expect(useUi.getState().toasts.map((toast) => toast.title)).toEqual([t('music.share_link_copy_failed')])
    expect(useMusic.getState().sharePlaylist).toHaveBeenCalledWith('p1')
  })

  it('a failed share request never reaches the clipboard', async () => {
    useMusic.setState({ sharePlaylist: vi.fn(async () => null) })
    const writeText = vi.fn(async () => {})
    stubClipboard({ writeText })
    await mount()
    await openMenu(0)
    await clickItem(t('music.share_playlist'))
    expect(writeText).not.toHaveBeenCalled()
    expect(useUi.getState().toasts).toEqual([])
  })
})
