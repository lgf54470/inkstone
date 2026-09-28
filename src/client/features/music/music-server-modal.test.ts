import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { renderElement } from '../../lib/test-render'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import { MusicServerModal } from './music-server-modal'

const SERVER = {
  id: 'sv-1', name: 'Home', kind: 'subsonic' as const, url: 'https://music.example.com',
  username: 'me', createdAt: 1, updatedAt: 1,
}
const HIT = { itemId: 'it-1', title: 'Origin', artist: 'Alice', album: 'Debut', durationMs: 214_000 }

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      music: {
        ...actual.api.music,
        listServerSources: vi.fn(async () => ({ servers: [SERVER] })),
        searchServerSource: vi.fn(async () => ({ serverId: 'sv-1', kind: 'subsonic', results: [HIT] })),
        importServerTrack: vi.fn(async () => ({ id: 'trk-1', title: 'Origin' })),
      },
    },
  }
})

import { api } from '../../lib/api'

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  useMusic.setState({
    serverSources: [],
    serverSourcesLoading: false,
    serverSourcesError: null,
    serverProbe: null,
    serverProbingId: null,
    serverSearch: { serverId: null, keywords: '', hits: [], searching: false, error: null, importingItemIds: [] },
    tracks: [],
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  window.localStorage.clear()
})

async function mount(onClose: () => void = () => {}): Promise<void> {
  renderElement(createElement(MusicServerModal, { open: true, onClose }))
  await act(async () => { await Promise.resolve() })
}

function buttonByText(text: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll('button')].find((button) => button.textContent?.trim() === text)
  if (!found) throw new Error(`no button reading ${text}`)
  return found as HTMLButtonElement
}

function searchField(): HTMLInputElement {
  const found = document.body.querySelector<HTMLInputElement>(`input[aria-label="${t('music.server_search')}"]`)
  if (!found) throw new Error('no search field')
  return found
}

async function runSearch(keywords: string): Promise<void> {
  await act(async () => {
    const field = searchField()
    // The field is controlled, so it goes through the native setter: assigning `.value` directly
    // leaves React's own tracker thinking nothing changed, and the keystroke never reaches the
    // component — the search would then look like a button that does nothing.
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    setValue.call(field, keywords)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => { buttonByText(t('music.server_search')).click() })
  await act(async () => { await Promise.resolve() })
}

// With nothing registered there is only one useful thing to show. An empty picker with a hint next to
// it would be a control that cannot do anything.
describe('music server modal with no server registered (FB-M16)', () => {
  it('opens the registration form and says where the search lives', async () => {
    vi.mocked(api.music.listServerSources).mockResolvedValueOnce({ servers: [] })
    await mount()
    expect(document.body.textContent).toContain(t('music.server_none'))
    expect(document.body.textContent).toContain(t('music.server_manage_hint'))
    expect(document.body.querySelector('form')).not.toBeNull()
  })
})

// FB2-F3: a server that reports no length gets no duration cell — the same rule the catalogue hit
// list follows — while a reported length is still drawn. Its own block because the rule is its own
// concern, and because a describe is a function the size gate reads.
describe('music server hit duration (FB2-F3)', () => {
  it('draws a reported length and leaves the cell out when the server reported none', async () => {
    vi.mocked(api.music.searchServerSource).mockResolvedValueOnce({
      serverId: 'sv-1', kind: 'subsonic', results: [{ ...HIT, itemId: 'it-2', title: 'No length', durationMs: 0 }, HIT],
    })
    await mount()
    await runSearch('origin')
    expect(document.body.textContent).toContain('03:34')
    expect(document.body.textContent).not.toContain(t('music.duration_unknown'))
    vi.mocked(api.music.searchServerSource).mockResolvedValueOnce({ serverId: 'sv-1', kind: 'subsonic', results: [{ ...HIT, durationMs: 0 }] })
    await runSearch('origin again')
    expect(document.body.textContent).toContain('Origin')
    expect(document.body.textContent).not.toContain('03:34')
    expect(document.body.textContent).not.toContain(t('music.duration_unknown'))
  })
})

describe('music server search and add (FB-M16)', () => {
  it('searches the first registered server and shows what it holds', async () => {
    await mount()
    await runSearch('origin')
    expect(api.music.searchServerSource).toHaveBeenCalledWith('sv-1', 'origin')
    expect(document.body.textContent).toContain('Origin')
    expect(document.body.textContent).toContain('Alice · Debut')
  })

  it('adds one hit to the library without taking over playback', async () => {
    await mount()
    await runSearch('origin')
    await act(async () => { buttonByText(t('music.server_add_one')).click() })
    await act(async () => { await Promise.resolve() })
    expect(api.music.importServerTrack).toHaveBeenCalledWith('sv-1', {
      itemId: 'it-1', title: 'Origin', artist: 'Alice', album: 'Debut', durationMs: 214_000,
    })
    expect(useMusic.getState().tracks.map((track) => track.id)).toEqual(['trk-1'])
  })

  it('adds the whole answer when asked to', async () => {
    vi.mocked(api.music.searchServerSource).mockResolvedValueOnce({
      serverId: 'sv-1', kind: 'subsonic', results: [HIT, { ...HIT, itemId: 'it-2', title: 'Second' }],
    })
    await mount()
    await runSearch('origin')
    await act(async () => { buttonByText(t('music.server_add_all')).click() })
    await act(async () => { await Promise.resolve() })
    expect(api.music.importServerTrack).toHaveBeenCalledTimes(2)
  })

  // Every state under the search box has words: a blank area reads as a dead control.
  it('says when the server answered nothing', async () => {
    vi.mocked(api.music.searchServerSource).mockResolvedValueOnce({ serverId: 'sv-1', kind: 'subsonic', results: [] })
    await mount()
    await runSearch('nothing')
    expect(document.body.textContent).toContain(t('music.server_search_empty'))
  })

  it('names the failure and offers the retry that can change it', async () => {
    vi.mocked(api.music.searchServerSource).mockRejectedValueOnce(new Error('offline'))
    await mount()
    await runSearch('origin')
    expect(document.body.textContent).toContain(t('music.server_search_failed', { value0: 'offline' }))
    await act(async () => { buttonByText(t('common.retry')).click() })
    await act(async () => { await Promise.resolve() })
    expect(api.music.searchServerSource).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('Origin')
  })
})
