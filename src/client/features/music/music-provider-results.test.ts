import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { useMusic } from './music-store'
import { MusicProviderResults, providerPanelState } from './music-provider-results'

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      music: {
        ...actual.api.music,
        providerSearch: vi.fn(async (source: string, keywords: string) => ({
          results: [{ provider: 'gds', source, sourceId: `${source}-1`, title: `${keywords} ${source}`, artist: 'Ann', album: 'Album', durationMs: null }],
        })),
      },
    },
  }
})

import { api } from '../../lib/api'

const QUERY = 'origin'

let rendered: ReturnType<typeof renderElement> | null = null

function hit(sourceId: string) {
  return { provider: 'gds', source: 'netease', sourceId, title: 'Settled', artist: '', album: '', durationMs: null }
}

function providerSwitch(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('[role="switch"]')
  if (!button) throw new Error('the online results panel draws no provider switch')
  return button
}

function bodyText(): string {
  return document.body.textContent ?? ''
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

beforeEach(() => {
  useMusic.setState({ query: '', providerEnabled: {}, providerResults: null, providerSearching: false, providerKeywords: '' })
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
    expect(providerPanelState({ enabled: true, searching: false, results: null, keywords: '', query: QUERY })).toBe('loading')
  })

  it('keeps reading as loading while the settled answer belongs to an older query', () => {
    expect(providerPanelState({ enabled: true, searching: false, results: [hit('a')], keywords: 'previous', query: QUERY })).toBe('loading')
  })

  it('names the off state before anything else', () => {
    expect(providerPanelState({ enabled: false, searching: true, results: [hit('a')], keywords: QUERY, query: QUERY })).toBe('off')
  })

  it('separates a settled empty answer from a settled answer with hits', () => {
    expect(providerPanelState({ enabled: true, searching: false, results: [], keywords: QUERY, query: QUERY })).toBe('none')
    expect(providerPanelState({ enabled: true, searching: false, results: [hit('a')], keywords: QUERY, query: QUERY })).toBe('ready')
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

  it('renders the hits once the answer for the current query settles', async () => {
    vi.useFakeTimers()
    mountWithQuery()

    await clickSwitch()
    await settle()

    expect(bodyText()).toContain(QUERY)
    expect(bodyText()).toContain(t('music.provider_add'))
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
