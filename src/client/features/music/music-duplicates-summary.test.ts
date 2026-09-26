import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { t } from '../../lib/i18n'
import { MusicDuplicatesSummary } from './music-hub-modal'
import { useMusic } from './music-store'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

function track(id: string, contentHash: string | null, title = id, durationMs = 60_000): MusicTrack {
  return {
    id, title, artist: 'artist', album: '', durationMs, source: 'r2', format: 'mp3', webdavPath: null,
    mime: 'audio/mpeg', sizeBytes: 100, coverUrl: null, lyric: null, hasLyric: false, tagIds: [],
    isFavorite: false, isPinned: false, playCount: 0, lastPlayedAt: null, contentHash, createdAt: 1, updatedAt: 1,
  }
}

let root: Root | null = null

async function mountSummary(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicDuplicatesSummary))
  })
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [] })
})

// The strip is the only place the numbers live, so approximate groups have to be
// named there — a WebDAV re-import must not read as a proven duplicate.
describe('the duplicates summary strip', () => {
  it('uses the plain wording while every group is checksum-proven', async () => {
    useMusic.setState({ tracks: [track('a', 'h1'), track('b', 'h1')] })
    await mountSummary()
    const strip = document.querySelector('[role="status"]')
    expect(strip?.textContent).toBe(t('music.duplicates_summary', { value0: 1, value1: 1, value2: '100 B', value3: 0 }))
  })

  it('says so when a group is only an approximate match', async () => {
    useMusic.setState({ tracks: [track('a', null, 'Song'), track('b', null, 'Song')] })
    await mountSummary()
    const strip = document.querySelector('[role="status"]')
    expect(strip?.textContent).toBe(t('music.duplicates_summary_approximate', { value0: 1, value1: 1, value2: '100 B', value3: 1 }))
  })
})
