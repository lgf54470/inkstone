import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { useMusic } from './music-store'
import { MusicProviderResults, providerFailureKey, providerPanelState } from './music-provider-results'

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      music: {
        ...actual.api.music,
        providerSearch: vi.fn(async (source: string, keywords: string) => ({
          results: [{ provider: 'gds', source, sourceId: `${source}-1`, title: `${keywords} ${source}`, artist: 'Ann', album: 'Album', durationMs: null, coverId: null, lyricId: null }],
        })),
        importProviderTrack: vi.fn(async (input: { title?: string }) => ({ id: 'trk-1', title: input.title ?? 'Song', source: 'provider' })),
      },
    },
  }
})
import { api, musicProviderCoverUrl, type MusicProviderTrack } from '../../lib/api'
import type { MusicTrack } from '@shared/types'

const QUERY = 'origin'
const CLEAR = { query: '', providerEnabled: {}, providerScope: 'all' as const, providerResults: null, providerSearching: false, providerKeywords: '', providerFailedSources: [] }

let rendered: ReturnType<typeof renderElement> | null = null

function hit(sourceId: string) {
  return { provider: 'gds', source: 'netease', sourceId, title: 'Settled', artist: '', album: '', durationMs: null, coverId: null, lyricId: null }
}

function providerSwitch(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('[role="switch"]')
  if (!button) throw new Error('the online results panel draws no provider switch')
  return button
}

function bodyText(): string {
  return document.body.textContent ?? ''
}

// FB-F10: one hit with every fact a catalogue can hand out, plus the answer that carries it.
const HIT: MusicProviderTrack = {
  provider: 'gds', source: 'netease', sourceId: 'a1', title: 'With art', artist: 'Ann',
  album: 'The Album', durationMs: 245_000, coverId: 'p9', lyricId: null,
}

async function mountHits(hits: MusicProviderTrack[]): Promise<void> {
  vi.useFakeTimers()
  vi.mocked(api.music.providerSearch).mockResolvedValue({ results: hits })
  mountWithQuery()
  await clickSwitch()
  await settle()
}

function buttonsByText(text: string): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].filter((button) => button.textContent?.trim() === text)
}

// The row's tick is the shared Checkbox (a `role="checkbox"` button), so a test reads it the way a
// screen reader does: by the role and the name, not by a markup detail.
function rowTicks(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('li [role="checkbox"]')]
}

function auditionButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('[data-provider-preview]')]
}

// FB2-U3: a press that starts a round trip is reported on the control that started it, so the read is
// the attribute the platform has for exactly that rather than a class or a word. Scoped to the row
// list: the batch bar's own button is busy for the same reason and is not a row.
function busyButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('[data-provider-results] [aria-busy="true"]')]
}

// A request whose answer this test decides, so the in-flight window can be read instead of raced.
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

// The library row a catalogue import lands: the provider halves are what make a hit and a row the same
// song again, which is the fact FB2-U3 reads.
function libraryTrack(overrides: Partial<MusicTrack> = {}): MusicTrack {
  return {
    id: 'trk-1', title: 'With art', artist: 'Ann', album: 'The Album', durationMs: 245_000,
    source: 'provider', format: null, webdavPath: null, providerSource: 'netease', providerSongId: 'a1',
    mime: 'audio/mpeg', sizeBytes: 1, coverUrl: null, lyric: null, hasLyric: false, tagIds: [],
    isFavorite: false, isPinned: false, playCount: 0, lastPlayedAt: null, contentHash: null,
    createdAt: 1, updatedAt: 1,
    ...overrides,
  }
}

// The reader's road: the query is already typed (and may have settled), then the switch is
// turned on. The panel is mounted before the switch is touched in every case below.
function mountWithQuery(): void {
  useMusic.setState({ query: QUERY })
  rendered = renderElement(createElement(MusicProviderResults))
}

async function settle(ms = 600): Promise<void> {
  await act(async () => { vi.advanceTimersByTime(ms) })
}

async function clickSwitch(): Promise<void> {
  await act(async () => { providerSwitch().click() })
}

function state(overrides: Partial<Parameters<typeof providerPanelState>[0]> = {}) {
  return providerPanelState({ enabled: true, searching: false, results: null, failedSources: [], keywords: QUERY, query: QUERY, ...overrides })
}

beforeEach(() => {
  useMusic.setState(CLEAR)
})

afterEach(() => {
  act(() => rendered?.unmount())
  rendered = null
  document.body.innerHTML = ''
  window.localStorage.clear()
  vi.useRealTimers()
  vi.clearAllMocks()
})

// FB-F2: the panel had a hole where it rendered nothing at all — enabled, no request in
// flight, no settled answer for this query, no message. That is precisely the state a
// reader reached by turning the switch on with a search already on screen.
describe('online results panel state (FB-F2)', () => {
  it('reads an enabled provider with an unanswered query as loading', () => {
    expect(state({ keywords: '' })).toBe('loading')
  })

  it('keeps reading as loading while the settled answer belongs to an older query', () => {
    expect(state({ results: [hit('a')], keywords: 'previous' })).toBe('loading')
  })

  it('names the off state before anything else', () => {
    expect(state({ enabled: false, searching: true, results: [hit('a')] })).toBe('off')
  })

  it('separates a settled empty answer from a settled answer with hits', () => {
    expect(state({ results: [] })).toBe('none')
    expect(state({ results: [hit('a')] })).toBe('ready')
  })

  // FB-F6: five catalogues with no match and five catalogues that did not answer used to
  // read as the same sentence.
  it('reads an empty answer with named failures as failed, not as no match', () => {
    expect(state({ results: [], failedSources: ['netease'] })).toBe('failed')
  })

  // FB3-F1: "every source" is the sources this search asked. With the scope narrowed to one
  // catalogue that catalogue failing is all of them, and the copy has to say so instead of counting
  // against the full five (a sentence about five sources when one was asked is a wrong fact).
  it('says every source failed only when every source that was asked failed', () => {
    expect(providerFailureKey(5, 5)).toBe('music.provider_all_failed')
    expect(providerFailureKey(1, 5)).toBe('music.provider_partial_failed')
    expect(providerFailureKey(1, 1)).toBe('music.provider_all_failed')
  })
})

describe('online results panel switch (FB-F2)', () => {
  it('asks the providers as soon as the switch is turned on under an existing query', async () => {
    vi.useFakeTimers()
    mountWithQuery()
    await settle()
    expect(api.music.providerSearch).not.toHaveBeenCalled()

    await clickSwitch()
    await settle()

    expect(api.music.providerSearch).toHaveBeenCalledTimes(5)
    expect(useMusic.getState().providerResults).toHaveLength(5)
  })

  it('shows a loading message instead of an empty panel between the switch and the answer', async () => {
    vi.useFakeTimers()
    mountWithQuery()
    await settle()

    await clickSwitch()

    expect(bodyText()).toContain(t('common.loading'))
  })

  it('stops asking and says so when the switch is turned off again', async () => {
    vi.useFakeTimers()
    useMusic.setState({ query: QUERY, providerEnabled: { gds: true }, providerResults: [hit('a')], providerKeywords: QUERY })
    rendered = renderElement(createElement(MusicProviderResults))

    await clickSwitch()
    await settle()

    expect(useMusic.getState().providerResults).toBeNull()
    expect(bodyText()).toContain(t('music.provider_off'))
  })
})

// FB3-F1 + FB3-U6: the reader's first question about an online list is which catalogue to ask, so the
// scope is a control of the panel's own header row beside the aggregate switch rather than a setting
// four screens away — and changing it is a reason to ask again, not just a change of who may answer.
describe('online results panel search scope (FB3-F1 + FB3-U6)', () => {
  function scopeSelect(): HTMLSelectElement {
    const select = document.querySelector<HTMLSelectElement>('[data-provider-scope]')
    if (!select) throw new Error('the online results panel draws no scope selector')
    return select
  }

  it('draws the scope selector in the same row as the aggregate switch', async () => {
    vi.useFakeTimers()
    mountWithQuery()
    await clickSwitch()
    await settle()

    const header = document.querySelector('[data-provider-header]')
    expect(header).toBeTruthy()
    expect(header?.contains(providerSwitch())).toBe(true)
    expect(header?.contains(scopeSelect())).toBe(true)
    // The aggregate option first, then one entry per catalogue the proxy forwards — the reader picks
    // by the same names the hits are labelled with.
    expect([...scopeSelect().options].map((option) => option.value)).toEqual(['all', 'netease', 'kuwo', 'migu', 'qq', 'bilibili'])
  })

  it('narrows the next search to the chosen catalogue', async () => {
    vi.useFakeTimers()
    mountWithQuery()
    await clickSwitch()
    await settle()
    vi.mocked(api.music.providerSearch).mockClear()

    const select = scopeSelect()
    await act(async () => {
      select.value = 'migu'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await settle()

    expect(useMusic.getState().providerScope).toBe('migu')
    expect(api.music.providerSearch).toHaveBeenCalledTimes(1)
    expect(api.music.providerSearch).toHaveBeenCalledWith('migu', QUERY)
  })
})

describe('online results panel rows (FB-U5)', () => {
  it('renders the hits with an add control once the answer settles', async () => {
    vi.useFakeTimers()
    mountWithQuery()

    await clickSwitch()
    await settle()

    expect(bodyText()).toContain(QUERY)
    expect(bodyText()).toContain(t('music.provider_add'))
  })

  // FB-U5: the row used to print the upstream's own slug, which is not a name anyone reads.
  // The row paints the key the label map picks; a missing mapping would paint the raw slug
  // in its place, which is what this asserts against.
  it('names the catalogue with its localized label', async () => {
    vi.useFakeTimers()
    mountWithQuery()

    await clickSwitch()
    await settle()

    expect(bodyText()).toContain(t('music.provider_source_netease'))
    expect(bodyText()).toContain(t('music.provider_source_kuwo'))
  })
})

// FB-F6: a source that did not answer is reported and can be retried; the sources that did
// answer keep their results either way.
describe('online results panel failures (FB-F6)', () => {
  it('reports the failed sources above the hits of the rest and retries them', async () => {
    vi.useFakeTimers()
    vi.mocked(api.music.providerSearch).mockRejectedValueOnce(new Error('source down'))
    mountWithQuery()

    await clickSwitch()
    await settle()

    expect(bodyText()).toContain(t('music.provider_partial_failed', { value0: 1 }))
    expect(useMusic.getState().providerResults).toHaveLength(4)
    const retry = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === t('music.retry'))
    expect(retry).toBeTruthy()

    await act(async () => { retry?.click() })
    await settle()

    expect(api.music.providerSearch).toHaveBeenCalledTimes(10)
    expect(useMusic.getState().providerFailedSources).toEqual([])
  })

  it('says no source answered when every one of them failed', async () => {
    vi.useFakeTimers()
    vi.mocked(api.music.providerSearch).mockRejectedValue(new Error('source down'))
    mountWithQuery()

    await clickSwitch()
    await settle()

    expect(bodyText()).toContain(t('music.provider_all_failed'))
    expect(bodyText()).not.toContain(t('music.provider_none'))
  })
})

// FB-F10: an online row carries the facts a library row carries — the catalogue's picture and the
// album the song belongs to.
describe('online result rows carry the catalogue facts (FB-F10)', () => {
  it('paints the catalogue artwork through the proxy address', async () => {
    await mountHits([HIT])
    const image = document.querySelector<HTMLImageElement>('img[data-provider-cover]')
    expect(image?.getAttribute('src')).toBe(musicProviderCoverUrl('netease', 'p9'))
    expect(image?.getAttribute('loading')).toBe('lazy')
  })

  // A hit without a picture id has no picture to paint; an empty frame would read as a broken one.
  it('draws no artwork frame for a hit the catalogue gave no picture id', async () => {
    await mountHits([{ ...HIT, coverId: null }])
    expect(document.querySelector('img[data-provider-cover]')).toBeNull()
  })

  it('names the album beside the artist', async () => {
    await mountHits([HIT])
    expect(bodyText()).toContain('The Album')
  })
})

// FB-F10: the two intents a search hit has — audition it (which takes over the player) or take it
// into the library (which does not) — plus the batch a ticked selection adds.
describe('online result rows take a hit into the library (FB-F10)', () => {
  beforeEach(() => {
    useMusic.setState({ tracks: [], queue: [], currentIndex: 0 })
  })

  it('takes a hit into the library without taking over the player', async () => {
    await mountHits([HIT])
    const add = buttonsByText(t('music.provider_add'))[0]
    expect(add).toBeTruthy()
    await act(async () => { add?.click() })
    expect(api.music.importProviderTrack).toHaveBeenCalledTimes(1)
    expect(useMusic.getState().tracks.map((entry) => entry.id)).toContain('trk-1')
    expect(useMusic.getState().queue).toEqual([])
  })

  it('auditions a hit by handing it to the player', async () => {
    await mountHits([HIT])
    const preview = auditionButtons()[0]
    expect(preview).toBeTruthy()
    // An icon carries no text, so its accessible name is the contract — it is what a keyboard or
    // screen-reader user hears this control called.
    expect(preview?.getAttribute('aria-label')).toBe(t('music.provider_preview'))
    await act(async () => { preview?.click() })
    expect(useMusic.getState().queue).toEqual(['trk-1'])
  })

  it('adds every ticked hit at once from the selection bar', async () => {
    await mountHits([HIT, { ...HIT, sourceId: 'a2', title: 'Second' }])
    const ticks = rowTicks()
    expect(ticks).toHaveLength(2)
    expect(ticks[0].getAttribute('aria-label')).toBe(t('music.provider_select', { value0: HIT.title }))
    await act(async () => { ticks[0].click(); ticks[1].click() })
    expect(rowTicks().every((tick) => tick.getAttribute('aria-checked') === 'true')).toBe(true)
    expect(bodyText()).toContain(t('music.provider_selected', { value0: 2 }))
    const addSelected = buttonsByText(t('music.provider_add_selected'))[0]
    expect(addSelected).toBeTruthy()
    await act(async () => { addSelected?.click() })
    expect(api.music.importProviderTrack).toHaveBeenCalledTimes(2)
    expect(useMusic.getState().tracks.map((entry) => entry.id)).toContain('trk-1')
  })
})

// FB-F10: a tick is about the answer on screen — a selection is not a shopping cart that survives
// scrolling to another catalogue page.
describe('online result selection follows the answer (FB-F10)', () => {
  it('drops a tick the new answer no longer lists', async () => {
    await mountHits([HIT])
    const box = rowTicks()[0]
    await act(async () => { box.click() })
    expect(bodyText()).toContain(t('music.provider_selected', { value0: 1 }))

    await act(async () => { useMusic.setState({ providerResults: [{ ...HIT, sourceId: 'b1' }], providerKeywords: QUERY }) })
    expect(bodyText()).not.toContain(t('music.provider_selected', { value0: 1 }))
    expect(rowTicks().every((tick) => tick.getAttribute('aria-checked') === 'false')).toBe(true)
  })
})

// FB-F5: several catalogues do not report a length at all, and 00:00 on screen is a claim the
// upstream never made. FB2-F3: what a hit list draws instead is nothing — repeating "unknown" on
// every row of a foreign list says nothing about any of them, and the reader is comparing rows.
// The library still names the absence, where it is a fact about a row the reader owns.
describe('online result rows (FB-F5 / FB2-F3)', () => {
  it('leaves the duration cell out when the catalogue did not report one', async () => {
    vi.useFakeTimers()
    // clearAllMocks keeps the implementation the previous case installed, so this one states the
    // answer it is about rather than inheriting a rejection.
    vi.mocked(api.music.providerSearch).mockResolvedValue({
      results: [{
        provider: 'gds', source: 'netease', sourceId: 'a1', title: 'No length', artist: 'Ann', album: '',
        durationMs: null, coverId: null, lyricId: null,
      }],
    })
    mountWithQuery()
    await clickSwitch()
    await settle()
    // The row is there and says what it knows: no timecode, and no "unknown" either.
    expect(bodyText()).toContain('No length')
    expect(bodyText()).toContain('Ann')
    expect(bodyText()).not.toContain(t('music.duration_unknown'))
  })

  it('draws the timecode when the catalogue reported one', async () => {
    vi.useFakeTimers()
    vi.mocked(api.music.providerSearch).mockResolvedValue({
      results: [{
        provider: 'gds', source: 'netease', sourceId: 'a1', title: 'Long song', artist: 'Ann', album: '',
        durationMs: 245_000, coverId: null, lyricId: null,
      }],
    })
    mountWithQuery()
    await clickSwitch()
    await settle()
    expect(bodyText()).toContain('04:05')
    expect(bodyText()).not.toContain(t('music.duration_unknown'))
  })
})

// FB2-U3: an import is a round trip — the worker asks the catalogue for the artwork and the words
// before the row exists — so the row the reader pressed has to say it is working. Before this the add
// button was live and silent the whole time: a press that took a second looked like a press that did
// nothing, and the same button happily took a second press on top of the first.
describe('online result rows report what they are doing (FB2-U3)', () => {
  beforeEach(() => {
    useMusic.setState({ tracks: [], queue: [], currentIndex: 0 })
  })

  // Two hits, so the same read covers both halves of the rule: the row that was pressed is busy, and
  // the row nobody touched is not.
  it('marks the row being added while its import is in flight, and clears it when the row lands', async () => {
    const pending = deferred<MusicTrack>()
    vi.mocked(api.music.importProviderTrack).mockImplementation(() => pending.promise)
    await mountHits([HIT, { ...HIT, sourceId: 'a2', title: 'Second' }])

    await act(async () => { buttonsByText(t('music.provider_add'))[0]?.click() })
    expect(busyButtons()).toHaveLength(1)
    expect(busyButtons()[0].textContent?.trim()).toBe(t('music.provider_add'))
    expect(busyButtons()[0].closest('li')?.textContent).toContain(HIT.title)

    await act(async () => {
      pending.resolve(libraryTrack())
      await pending.promise
    })

    expect(busyButtons()).toHaveLength(0)
    expect(useMusic.getState().tracks.map((entry) => entry.id)).toContain('trk-1')
  })

  it('marks the row being auditioned while its import is in flight', async () => {
    const pending = deferred<MusicTrack>()
    vi.mocked(api.music.importProviderTrack).mockImplementation(() => pending.promise)
    await mountHits([HIT])

    await act(async () => { auditionButtons()[0]?.click() })
    const audition = auditionButtons()[0]
    expect(audition.getAttribute('aria-busy')).toBe('true')
    expect(audition.disabled).toBe(true)

    await act(async () => {
      pending.resolve(libraryTrack())
      await pending.promise
    })

    expect(auditionButtons()[0].getAttribute('aria-busy')).not.toBe('true')
    expect(useMusic.getState().queue).toEqual(['trk-1'])
  })
})

// FB2-U3: the fact a reader cannot see otherwise — the catalogue has a copy and the library already
// holds it. Offering the same button again would be a second import whose only visible effect is a
// toast about a row the reader already has.
describe('online result rows say what the library already holds (FB2-U3)', () => {
  beforeEach(() => {
    useMusic.setState({ tracks: [], queue: [], currentIndex: 0 })
  })

  it('names a hit the library already holds instead of offering to add it again', async () => {
    useMusic.setState({ tracks: [libraryTrack()] })
    await mountHits([HIT])

    expect(buttonsByText(t('music.provider_add'))).toHaveLength(0)
    const held = buttonsByText(t('music.provider_in_library'))[0]
    expect(held).toBeTruthy()
    expect(held.disabled).toBe(true)
  })

})

// FB2-U3: a row the batch is writing is the same wait seen from the row, so it says so there as well
// as on the bar — the reader who ticked it should not have to look somewhere else to find out that
// something is happening.
describe('the online batch reports on the rows it is writing (FB2-U3)', () => {
  beforeEach(() => {
    useMusic.setState({ tracks: [], queue: [], currentIndex: 0 })
  })

  it('reports every ticked row busy while the batch runs, and lands them all', async () => {
    const pendings: Array<ReturnType<typeof deferred<MusicTrack>>> = []
    vi.mocked(api.music.importProviderTrack).mockImplementation(() => {
      const next = deferred<MusicTrack>()
      pendings.push(next)
      return next.promise
    })
    await mountHits([HIT, { ...HIT, sourceId: 'a2', title: 'Second' }])
    const ticks = rowTicks()
    await act(async () => { ticks[0].click(); ticks[1].click() })

    await act(async () => { buttonsByText(t('music.provider_add_selected'))[0]?.click() })
    expect(busyButtons()).toHaveLength(2)

    await act(async () => {
      pendings[0]?.resolve(libraryTrack({ id: 'trk-1' }))
      await Promise.resolve()
      await Promise.resolve()
      pendings[1]?.resolve(libraryTrack({ id: 'trk-2', providerSongId: 'a2' }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(useMusic.getState().tracks.map((entry) => entry.id)).toEqual(['trk-1', 'trk-2'])
  })
})
