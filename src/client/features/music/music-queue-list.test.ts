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
    createdAt: 0,
    updatedAt: 0,
  }
}

let root: Root | null = null

async function mountList(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicQueueList))
  })
}

function labelledButtons(root: ParentNode, label: string): HTMLButtonElement[] {
  return [...root.querySelectorAll('button')].filter((button) => button.getAttribute('aria-label') === label)
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [], queue: [], currentIndex: 0 })
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
