import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { useMusic } from './music-store'
import { ProviderSuggestions } from './music-provider-suggestions'
import type { MusicProviderTrack } from '../../lib/api'
import type { MusicTrack } from '@shared/types'

// FB3-F8 + FB3-C7: the words in the box, read against the library and the catalogue — the jump targets
// and the catalogue's own answer. These rows are drawn inside the panel, above the hits they lead to,
// rather than in a drop-down over it: that popup's box covered the ticks of the first hits, so the visual
// gate's press aimed at a tick landed on a suggestion instead (the tick at x=297, the box at x=298).
const QUERY = 'Ann'

const CLEAR = {
  query: '', scope: { kind: 'all' } as const, tracks: [], playlists: [],
  providerResults: null, providerKeywords: '', providerSearching: false,
}

// The catalogue's player entry point: a press on a suggestion must not reach it (FB3-C6).
const play = vi.fn(async () => {})

function hit(sourceId = 'a1'): MusicProviderTrack {
  return { provider: 'gds', source: 'netease', sourceId, title: 'With art', artist: 'Ann', album: 'The Album', durationMs: null, coverId: null, lyricId: null }
}

// A library row carrying the catalogue halves of `hit`, so the catalogue's own row is one the library
// already holds — which is what its meta says.
function libraryTrack(overrides: Partial<MusicTrack> = {}): MusicTrack {
  return {
    id: 'lib-1', title: 'With art', artist: 'Ann', album: 'The Album', durationMs: 245_000,
    source: 'provider', format: null, webdavPath: null, providerSource: 'netease', providerSongId: 'a1',
    mime: 'audio/mpeg', sizeBytes: 1, coverUrl: null, lyric: null, hasLyric: false, tagIds: [],
    isFavorite: false, isPinned: false, playCount: 0, lastPlayedAt: null, contentHash: null,
    createdAt: 1, updatedAt: 1,
    ...overrides,
  }
}

let rendered: ReturnType<typeof renderElement> | null = null

function rows(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('[data-provider-suggestions] button')]
}

function labels(): string[] {
  return rows().map((button) => (button.textContent ?? '').trim())
}

/** The reader's state: a library, the answer the catalogue gave for the words in the box. */
function mountAnswered(answers: MusicProviderTrack[] = [hit()]): void {
  useMusic.setState({
    query: QUERY,
    providerKeywords: QUERY,
    providerResults: answers,
    tracks: [libraryTrack()],
    playlists: [],
  })
  rendered = renderElement(createElement(ProviderSuggestions))
}

beforeEach(() => {
  useMusic.setState({ ...CLEAR, playProviderTrack: play })
})

afterEach(() => {
  act(() => rendered?.unmount())
  rendered = null
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('the panel carries the search suggestions (FB3-F8)', () => {
  it('lists the library jump targets beside the catalogue answer', () => {
    mountAnswered()
    const strip = document.querySelector('[data-provider-suggestions]')
    expect(strip?.getAttribute('aria-label')).toBe(t('music.search_suggestions'))
    expect(labels().some((label) => label.startsWith('Ann'))).toBe(true)
    expect(labels().some((label) => label.includes(t('music.provider_in_library')))).toBe(true)
  })

  it('jumps to a library group when its row is pressed, and clears the words that named it', () => {
    mountAnswered()
    const artist = rows().find((button) => button.textContent?.startsWith('Ann'))
    expect(artist).toBeTruthy()
    act(() => { artist?.click() })
    expect(useMusic.getState().scope).toEqual({ kind: 'artist', artist: 'Ann' })
    expect(useMusic.getState().query).toBe('')
  })

  it('hands a catalogue row its own words instead of playing it', () => {
    mountAnswered()
    const online = rows().find((button) => button.textContent?.includes(t('music.provider_in_library')))
    expect(online).toBeTruthy()
    act(() => { online?.click() })
    expect(play).not.toHaveBeenCalled()
    expect(useMusic.getState().query).toBe('With art')
  })

  it('draws nothing when the words name nothing and no catalogue answered them', () => {
    useMusic.setState({ query: 'zzz', providerKeywords: 'zzz', providerResults: [], tracks: [], playlists: [] })
    rendered = renderElement(createElement(ProviderSuggestions))
    expect(document.querySelector('[data-provider-suggestions]')).toBeNull()
  })
})
