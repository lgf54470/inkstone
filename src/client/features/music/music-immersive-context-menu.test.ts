import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { initI18n, t } from '../../lib/i18n'
import { MusicImmersivePlayer } from './music-immersive-player'
import { useMusic } from './music-store'

// The immersive surface handed right clicks to the browser: over a page of one song, the menu offered
// reload, print and inspect. It answers with the track's own menu now — the same one the rows open,
// because it is the same request — and a queue row answers for its own track rather than for whatever
// is playing behind the reader's pointer. Split from `music-immersive-player.test.ts`, which is at its
// file budget; the surface under test is the same one, the subject here is the menu alone.

beforeAll(async () => {
  await initI18n()
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollIntoView = vi.fn()
})

// This jsdom ships no matchMedia at all; the player reads one media query.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: 1280 >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [], queue: [], currentIndex: 0, trackMenu: null, trackEditRequest: null })
  vi.unstubAllGlobals()
})

function stageTrack(id: string, title: string): MusicTrack {
  return {
    id, title, artist: 'Hu Yanbin', album: 'Answer', durationMs: 200_000, source: 'r2', format: 'mp3',
    webdavPath: null, mime: 'audio/mpeg', sizeBytes: 1024, coverUrl: null, lyric: null, hasLyric: false,
    tagIds: [], isFavorite: false, isPinned: false, playCount: 0, lastPlayedAt: null, contentHash: null,
    createdAt: 0, updatedAt: 0,
  }
}

/** Mounts the surface with one track playing and a second one behind it in the queue. */
async function mountStage(): Promise<{ playing: MusicTrack; queued: MusicTrack }> {
  const playing = stageTrack('track-1', 'Moonlight')
  const queued = stageTrack('track-2', 'Sunrise')
  useMusic.setState({ tracks: [playing, queued], queue: [playing.id, queued.id], currentIndex: 0, trackMenu: null, trackEditRequest: null })
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicImmersivePlayer, { open: true, onClose: vi.fn() }))
  })
  return { playing, queued }
}

/** The reader's own gesture, at a known point so the anchor can be read back. */
function rightClick(target: Element): MouseEvent {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 12, clientY: 34 })
  act(() => { target.dispatchEvent(event) })
  return event
}

/** The same request from a keyboard: the menu key, or Shift+F10 where there is no menu key. */
function menuKey(target: Element, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ContextMenu', ...init })
  act(() => { target.dispatchEvent(event) })
  return event
}

describe('the immersive surface answers a right click with the track menu', () => {
  it('opens the menu for the track that is playing, anchored at the pointer', async () => {
    const { playing } = await mountStage()
    // The lyrics pane is one of the two columns the surface is made of, so this is "somewhere on the
    // player that is not a control": the handler belongs to the surface, not to a button.
    const event = rightClick(document.querySelector(`[aria-label="${t('music.lyrics')}"]`)!)
    expect(event.defaultPrevented).toBe(true)
    const menu = useMusic.getState().trackMenu
    expect(menu?.target.track.id).toBe(playing.id)
    expect(menu?.anchor).toEqual({ x: 12, y: 34 })
  })

  it('answers for the queue row under the pointer, not for the playing track', async () => {
    const { queued } = await mountStage()
    const row = [...document.querySelectorAll(`[aria-label="${t('music.queue')}"] button`)]
      .find((button) => button.textContent?.includes('Sunrise'))
    expect(row).toBeDefined()
    rightClick(row!)
    expect(useMusic.getState().trackMenu?.target.track.id).toBe(queued.id)
  })

  it('leaves a field the reader types into its own browser menu', async () => {
    await mountStage()
    const field = document.querySelector(`input[aria-label="${t('music.queue_search')}"]`)
    expect(field).toBeDefined()
    const event = rightClick(field!)
    expect(event.defaultPrevented).toBe(false)
    expect(useMusic.getState().trackMenu).toBeNull()
  })
})

// The right click above is one way in, not the only one: the same menu has to answer the keyboard, or
// the actions it holds (pinning, playlists, download, edit, delete, lyric search) are pointer-only on
// the two surfaces that have no menu button of their own. Both spellings are read, because a keyboard
// with no menu key sends Shift+F10 — and the handler is on the surface, not on a control, so any
// focused control inside it is enough to reach the menu.
describe('the same menu answers the keyboard', () => {
  it('opens for the track that is playing, from the menu key', async () => {
    const { playing } = await mountStage()
    const event = menuKey(document.querySelector(`[aria-label="${t('music.lyrics')}"]`)!)
    expect(event.defaultPrevented).toBe(true)
    expect(useMusic.getState().trackMenu?.target.track.id).toBe(playing.id)
  })

  it('answers for the queue row that holds the focus, on Shift+F10', async () => {
    const { queued } = await mountStage()
    const row = [...document.querySelectorAll(`[aria-label="${t('music.queue')}"] button`)]
      .find((button) => button.textContent?.includes('Sunrise'))
    expect(row).toBeDefined()
    menuKey(row!, { key: 'F10', shiftKey: true })
    expect(useMusic.getState().trackMenu?.target.track.id).toBe(queued.id)
  })

  it('leaves every other key alone', async () => {
    await mountStage()
    const event = menuKey(document.querySelector(`[aria-label="${t('music.lyrics')}"]`)!, { key: 'ArrowDown' })
    expect(event.defaultPrevented).toBe(false)
    expect(useMusic.getState().trackMenu).toBeNull()
  })
})
