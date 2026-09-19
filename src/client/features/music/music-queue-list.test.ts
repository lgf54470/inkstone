import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { t } from '../../lib/i18n'
import { MusicQueueList } from './music-queue-list'
import { useMusic } from './music-store'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

function track(id: string): MusicTrack {
  return {
    id,
    title: id,
    artist: '',
    album: '',
    durationMs: 1000,
    source: 'r2',
    format: 'mp3',
    webdavPath: null,
    mime: 'audio/mpeg',
    sizeBytes: 0,
    coverUrl: null,
    lyric: null,
    hasLyric: false,
    tagIds: [],
    isFavorite: false,
    isPinned: false,
    playCount: 0,
    lastPlayedAt: null, contentHash: null,
    createdAt: 0,
    updatedAt: 0,
  }
}

let root: Root | null = null

async function mountList(props: Record<string, unknown> = {}): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicQueueList, props))
  })
}

function labelledButtons(root: ParentNode, label: string): HTMLButtonElement[] {
  return [...root.querySelectorAll('button')].filter((button) => button.getAttribute('aria-label') === label)
}

function transferStore(): { setData: (k: string, v: string) => void; getData: (k: string) => string; effectAllowed: string; dropEffect: string } {
  const data: Record<string, string> = {}
  return {
    setData: (key, value) => { data[key] = value },
    getData: (key) => data[key] ?? '',
    effectAllowed: '',
    dropEffect: '',
  }
}

function fireDrag(node: Element, type: 'dragstart' | 'dragover' | 'drop', transfer: ReturnType<typeof transferStore>): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: transfer })
  node.dispatchEvent(event)
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [], queue: [], currentIndex: 0, sleepEndsAt: null, sleepAfterCurrentTrack: false })
})

describe('MusicQueueList with the same track queued twice', () => {
  it('removes the second occurrence by its own queue position', async () => {
    const removeFromQueue = vi.fn()
    useMusic.setState({
      tracks: [track('a'), track('b')],
      queue: ['a', 'b', 'a'],
      currentIndex: 0,
      removeFromQueue,
      playQueueAt: vi.fn(async () => {}),
    })
    await mountList()
    const removeButtons = labelledButtons(document, t('music.remove_from_queue'))
    expect(removeButtons).toHaveLength(3)
    await act(async () => {
      removeButtons[2]?.click()
    })
    expect(removeFromQueue).toHaveBeenCalledWith(2)
  })

  it('plays the second occurrence at its own queue position', async () => {
    const playQueueAt = vi.fn(async () => {})
    useMusic.setState({
      tracks: [track('a'), track('b')],
      queue: ['a', 'b', 'a'],
      currentIndex: 0,
      removeFromQueue: vi.fn(),
      playQueueAt,
    })
    await mountList()
    const titleButtons = [...document.querySelectorAll('button')].filter((button) => button.textContent?.startsWith('a'))
    expect(titleButtons).toHaveLength(2)
    await act(async () => {
      titleButtons[1]?.click()
    })
    expect(playQueueAt).toHaveBeenCalledWith(2)
  })
})

function seedQueue(moveQueueItem = vi.fn()) {
  useMusic.setState({
    tracks: [track('a'), track('b'), track('c')],
    queue: ['a', 'b', 'c'],
    currentIndex: 0,
    removeFromQueue: vi.fn(),
    playQueueAt: vi.fn(async () => {}),
    moveQueueItem,
  })
  return moveQueueItem
}

describe('MusicQueueList reorder affordances', () => {
  it('moves a dragged row onto the queue position it was dropped on', async () => {
    const moveQueueItem = seedQueue()
    await mountList()
    const rows = [...document.querySelectorAll('[draggable="true"]')]
    expect(rows).toHaveLength(3)
    const transfer = transferStore()
    await act(async () => {
      fireDrag(rows[0], 'dragstart', transfer)
    })
    await act(async () => {
      fireDrag(rows[2], 'drop', transfer)
    })
    expect(moveQueueItem).toHaveBeenCalledWith(0, 2)
  })

  it('offers move buttons that shift a row by one queue position', async () => {
    const moveQueueItem = seedQueue()
    await mountList()
    const ups = labelledButtons(document, t('music.move_up'))
    expect(ups[1]?.disabled).toBe(false)
    await act(async () => {
      ups[1]?.click()
    })
    expect(moveQueueItem).toHaveBeenCalledWith(1, 0)
  })

  it('disables moving past the ends of the queue', async () => {
    seedQueue()
    await mountList()
    const ups = labelledButtons(document, t('music.move_up'))
    const downs = labelledButtons(document, t('music.move_down'))
    expect(ups[0]?.disabled).toBe(true)
    expect(downs[downs.length - 1]?.disabled).toBe(true)
  })

  it('offers no reorder handles while the queue browser filters rows', async () => {
    seedQueue()
    await mountList({ ids: ['a', 'c'] })
    expect(document.querySelector('[draggable="true"]')).toBeNull()
    expect(labelledButtons(document, t('music.move_up'))).toHaveLength(0)
    expect(labelledButtons(document, t('music.remove_from_queue'))).toHaveLength(2)
  })
})
