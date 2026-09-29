import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { MusicFloatingPlayer } from './music-floating-player'
import { useMusic } from './music-store'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  if (typeof (globalThis as Record<string, unknown>).ResizeObserver === 'undefined') {
    ;(globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

let root: Root | null = null

async function mountPlayer(setFloatingPosition: (position: { x: number; y: number }) => void): Promise<void> {
  useMusic.setState({ floatingVisible: true, floatingCollapsed: false, floatingPosition: { x: 100, y: 100 }, setFloatingPosition })
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicFloatingPlayer))
  })
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ floatingVisible: false, floatingPosition: null })
  useUi.setState({ panel: null })
})

// V-4: the hub draws its own transport in the dialog footer; the floating card on top of it made
// two play buttons for one track, and neither said which one was in charge.
describe('floating player defers to the open hub', () => {
  it('steps aside while the hub is open', async () => {
    useUi.setState({ panel: 'music-hub' })
    await mountPlayer(vi.fn())
    expect(document.querySelector(`aside[aria-label="${t('music.mini_player')}"]`)).toBeNull()
  })

  it('returns when the hub closes', async () => {
    await mountPlayer(vi.fn())
    expect(document.querySelector(`aside[aria-label="${t('music.mini_player')}"]`)).not.toBeNull()
  })
})

// Running on a phone, this card is the whole music surface — and it carried one of the track's two
// favours. Pinning is the heart's twin: the immersive player, the hub's now-playing panel and the
// status bar all offer both beside each other.
describe('the mini player carries both favours', () => {
  const track: MusicTrack = {
    id: 't1', title: 'Alpha', artist: '', album: '', durationMs: 0, source: 'r2', format: 'mp3',
    webdavPath: null, mime: 'audio/mpeg', sizeBytes: 0, coverUrl: null, lyric: null, hasLyric: false,
    tagIds: [], isFavorite: false, isPinned: false, playCount: 0, lastPlayedAt: null, contentHash: null,
    createdAt: 0, updatedAt: 0,
  }

  it('pins the playing track from the card', async () => {
    const togglePin = vi.fn(async () => {})
    useMusic.setState({ tracks: [track], queue: ['t1'], currentIndex: 0, togglePin })
    await mountPlayer(vi.fn())
    const pin = document.querySelector(`button[aria-label="${t('music.pin')}"]`) as HTMLButtonElement | null
    expect(pin).toBeDefined()
    await act(async () => { pin?.click() })
    expect(togglePin).toHaveBeenCalledWith('t1')
  })

  it('offers unpinning once the track is pinned', async () => {
    useMusic.setState({ tracks: [{ ...track, isPinned: true }], queue: ['t1'], currentIndex: 0 })
    await mountPlayer(vi.fn())
    expect(document.querySelector(`button[aria-label="${t('music.unpin')}"]`)).not.toBeNull()
  })
})

// FB-C3: the card is the phone's whole music surface, and its way into the hub is the control the
// shell focuses again when the hub closes — the card unmounts while the hub is open, so the marker
// is what the hand-off reads to find it once it is back (`successorOf`).
describe('hub opener successor marker (FB-C3)', () => {
  it('marks the card\u2019s own way into the library', async () => {
    await mountPlayer(vi.fn())
    const marked = [...document.querySelectorAll('[data-music-opener="hub"]')]
    expect(marked.map((button) => button.getAttribute('aria-label'))).toEqual([t('music.open_hub')])
  })
})

describe('floating player drag handle', () => {
  it('is a real button with an accurate label, not a role-imitating span', async () => {
    await mountPlayer(vi.fn())
    expect(document.querySelector('span[role="button"]')).toBeNull()
    const handle = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === t('music.move_player'))
    expect(handle).toBeDefined()
  })

  it('moves the card by the keyboard step on arrow keys', async () => {
    const setPosition = vi.fn()
    await mountPlayer(setPosition)
    const handle = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === t('music.move_player'))
    await act(async () => {
      handle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(setPosition).toHaveBeenCalledWith({ x: 116, y: 100 })
  })

  it('sends the card back to its default corner when activated', async () => {
    const setPosition = vi.fn()
    await mountPlayer(setPosition)
    const handle = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === t('music.move_player'))
    await act(async () => { handle?.click() })
    expect(setPosition).toHaveBeenCalledTimes(1)
    const [position] = setPosition.mock.calls[0] as [{ x: number; y: number }]
    expect(position.x).toBeGreaterThan(window.innerWidth / 2)
    expect(position.y).toBeGreaterThan(window.innerHeight / 2)
  })

  it('tells assistive tech that the arrow keys are what move it', async () => {
    await mountPlayer(vi.fn())
    const handle = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === t('music.move_player'))
    const describedBy = handle?.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)?.textContent).toBe(t('music.move_player_hint'))
  })
})
