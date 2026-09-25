import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { MusicStatusBar } from './music-status-bar'
import { useMusic } from './music-store'

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
