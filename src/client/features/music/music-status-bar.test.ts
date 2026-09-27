import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { MusicStatusBar } from './music-status-bar'
import { useMusic } from './music-store'
import { MUSIC_BAR_EQ_MIN_WIDTH } from './music-utils'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null

function playingTrack(): MusicTrack {
  return {
    id: 'track-1', title: 'Moonlight', artist: 'Hu Yanbin', album: 'Answer',
    durationMs: 200_000, source: 'r2', format: 'mp3', webdavPath: null, mime: 'audio/mpeg',
    sizeBytes: 1024, coverUrl: null, lyric: null, hasLyric: false, tagIds: [],
    isFavorite: false, isPinned: false, playCount: 0, lastPlayedAt: null, contentHash: null,
    createdAt: 0, updatedAt: 0,
  }
}

async function mount(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root?.render(createElement(MusicStatusBar, {})) })
}

function trackButton(): HTMLButtonElement {
  return [...document.querySelectorAll('button')].find((button) => button.textContent === 'Moonlight') as HTMLButtonElement
}

beforeEach(() => {
  useUi.setState({ panel: null, openPanel: vi.fn() })
  useMusic.setState({ tracks: [playingTrack()], queue: ['track-1'], currentIndex: 0 })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

// The bar is three controls wide; the track name doubles as the way into the hub. Announcing
// bare "Moonlight" describes a label, not what pressing it does.
describe('status bar track button', () => {
  it('names the action it performs, not just the song', async () => {
    await mount()
    expect(trackButton().getAttribute('aria-label')).toBe(t('music.open_hub_track', { value0: 'Moonlight' }))
  })

  it('leaves the native tooltip to the component tooltip instead of duplicating it', async () => {
    await mount()
    expect(trackButton().getAttribute('title')).toBeNull()
  })

  it('still opens the hub when activated', async () => {
    await mount()
    await act(async () => { trackButton().click() })
    expect(useUi.getState().openPanel).toHaveBeenCalledWith('music-hub')
  })
})

// V-4: with the hub open, its own footer is the transport. The bar kept a second set of play
// buttons under it, so one track had three ways to be paused and no obvious one.
describe('status bar defers to the open hub', () => {
  function labelled(name: string): Element | undefined {
    return [...document.querySelectorAll('button, input')].find((entry) => entry.getAttribute('aria-label') === name)
  }

  it('drops the transport while the hub is on screen', async () => {
    useUi.setState({ panel: 'music-hub' })
    await mount()
    expect(labelled(t('music.seek'))).toBeUndefined()
    expect(labelled(t('music.play'))).toBeUndefined()
    expect(labelled(t('music.open_hub_track', { value0: 'Moonlight' }))).toBeDefined()
  })

  it('keeps the full transport once the hub is closed', async () => {
    await mount()
    expect(labelled(t('music.seek'))).toBeDefined()
    expect(labelled(t('music.play'))).toBeDefined()
  })
})

// FB-U3: the bar draws its pin from xl up and its equalizer from lg up, and a control hidden by CSS
// is unreachable rather than degraded — at 768–1024 neither of them is anywhere on the page. One
// entry carries what this width hides; the browser gate is what proves the CSS side of that promise,
// and these cases pin what the entry is asked to carry.
describe('status bar more entry (FB-U3)', () => {
  function stubBarWidth({ eqInline, pinInline }: { eqInline: boolean; pinInline: boolean }): void {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes(String(MUSIC_BAR_EQ_MIN_WIDTH)) ? eqInline : pinInline,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
  }

  function moreTrigger(): HTMLButtonElement | undefined {
    return [...document.querySelectorAll('button')]
      .find((button) => button.getAttribute('aria-label') === t('music.more_actions')) as HTMLButtonElement | undefined
  }

  function openedPanel(): Element | null {
    return document.querySelector(`[role="dialog"][aria-label="${t('music.more_actions')}"]`)
  }

  it('is not drawn where the bar already draws both of them', async () => {
    stubBarWidth({ eqInline: true, pinInline: true })
    await mount()
    expect(moreTrigger()).toBeUndefined()
  })

  it('carries the pin where the bar hides it, without repeating the equalizer', async () => {
    stubBarWidth({ eqInline: true, pinInline: false })
    await mount()
    const trigger = moreTrigger()
    expect(trigger).toBeDefined()
    await act(async () => { trigger?.click() })
    const panel = openedPanel()
    expect(panel).not.toBeNull()
    expect(panel?.querySelector('[role="switch"]')?.getAttribute('aria-label')).toBe(t('music.pin'))
    expect(panel?.querySelector(`button[aria-label="${t('music.eq')}"]`)).toBeNull()
  })

  it('carries both of them where both are hidden, as named rows', async () => {
    stubBarWidth({ eqInline: false, pinInline: false })
    await mount()
    const trigger = moreTrigger()
    await act(async () => { trigger?.click() })
    const panel = openedPanel()
    expect(panel?.querySelector('[role="switch"]')?.getAttribute('aria-label')).toBe(t('music.pin'))
    // Scoped to the panel: the bar's own inline copy is still in the document, hidden by CSS.
    expect(panel?.querySelector(`button[aria-label="${t('music.eq')}"]`)).not.toBeNull()
    // The anchor publishes the state the panel is in, which is what a screen reader reads there.
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
  })
})

// FB-C3: the bar opens the hub from three different controls depending on what is playing, and the
// hub replaces whichever one was pressed (the transport row becomes the quiet title row). The marker
// is the contract the keyboard hand-off reads when Escape closes the hub — a control without it is a
// dead end, which is exactly what the browser gate measured: focus landed on the body.
describe('hub opener successor marker (FB-C3)', () => {
  const marked = (): Element[] => [...document.querySelectorAll('[data-music-opener="hub"]')]

  it('marks the icon the bar draws before anything plays', async () => {
    useMusic.setState({ tracks: [], queue: [], currentIndex: 0 })
    await mount()
    expect(marked()).toHaveLength(1)
    expect(marked()[0]?.getAttribute('aria-label')).toBe(t('music.open_hub'))
  })

  it('marks the transport row\u2019s own way into the library', async () => {
    await mount()
    const control = marked().find((entry) => entry.getAttribute('aria-label') === t('music.expand_player'))
    expect(control).toBeDefined()
  })

  it('marks the title row that replaces the opener while the hub is open', async () => {
    useUi.setState({ panel: 'music-hub' })
    await mount()
    const control = marked()[0]
    expect(control?.getAttribute('aria-label')).toBe(t('music.open_hub_track', { value0: 'Moonlight' }))
  })

  // The marker alone does not put the keyboard back: the shared hand-off captured its opener one
  // commit too late (the bar had already swapped the control away, so the browser had already moved
  // focus to the body). The bar owns the replacement, so the transition that closes the hub is what
  // takes the keyboard back — and only when nothing else holds it.
  it('takes the keyboard back when the hub closes and nothing else holds it', async () => {
    useUi.setState({ panel: 'music-hub' })
    await mount()
    expect(document.activeElement).toBe(document.body)
    await act(async () => { useUi.setState({ panel: null }) })
    expect(document.activeElement).toBe(marked()[0])
  })

  it('leaves the keyboard alone when something else already holds it', async () => {
    useUi.setState({ panel: 'music-hub' })
    await mount()
    const elsewhere = document.createElement('button')
    document.body.appendChild(elsewhere)
    elsewhere.focus()
    await act(async () => { useUi.setState({ panel: null }) })
    expect(document.activeElement).toBe(elsewhere)
  })
})
