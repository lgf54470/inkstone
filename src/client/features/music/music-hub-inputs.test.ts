import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicPlaylistDetail, MusicTag } from '@shared/types'
import { t } from '../../lib/i18n'
import { MusicHubPlaylists } from './music-hub-playlists'
import { MusicHubTags } from './music-hub-tags'
import { useMusic } from './music-store'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

const FOCUS_RING = 'focus:shadow-[var(--shadow-focus)]'

let root: Root | null = null

async function mount(node: React.ReactNode): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root?.render(node) })
  return container
}

function tag(id: string, name: string): MusicTag {
  return { id, name, color: null, isPinned: false, parentId: null, sortOrder: 0, createdAt: 0 } as unknown as MusicTag
}

function playlist(id: string, name: string): MusicPlaylistDetail {
  return { id, name, description: '', isPinned: false, isFavorite: false, shareSlug: null, trackCount: 0, items: [] } as unknown as MusicPlaylistDetail
}

beforeEach(() => {
  useMusic.setState({
    tags: [tag('tag-1', 'Focus')],
    playlists: [playlist('p1', 'Road Trip')],
    tracks: [],
    scope: { kind: 'all' },
    renamePlaylist: vi.fn(async () => true),
  })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

// The shared Input paints its own focus ring (border + shadow); the two fields the hub hand-rolled
// suppressed the outline outright, so tabbing into them moved the caret with nothing on screen to
// say where it had landed.
describe('hub text fields keep the shared focus ring', () => {
  it('draws it on the tag filter', async () => {
    const container = await mount(createElement(MusicHubTags, { onManage: () => {} }))
    const input = container.querySelector('input')!
    expect(input.classList.contains(FOCUS_RING)).toBe(true)
  })

  it('draws it on the playlist rename field', async () => {
    const container = await mount(createElement(MusicHubPlaylists, { onCreate: () => {} }))
    const anchor = [...container.querySelectorAll('button')]
      .filter((button) => button.getAttribute('aria-label') === t('music.open_menu'))[0]!
    await act(async () => { anchor.click() })
    const rename = [...document.querySelectorAll('[role="menuitem"]')]
      .find((item) => item.textContent?.includes(t('music.rename'))) as HTMLButtonElement
    await act(async () => { rename.click() })
    const input = container.querySelector('input')!
    expect(input.getAttribute('aria-label')).toBe(t('music.rename'))
    expect(input.classList.contains(FOCUS_RING)).toBe(true)
  })
})
