import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTag, MusicTrack } from '@shared/types'
import { t } from '../../lib/i18n'
import { MusicInsightsModal } from './music-insights-modal'
import { useMusic } from './music-store'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null

function track(id: string, overrides: Partial<MusicTrack> = {}): MusicTrack {
  return {
    id, title: id, artist: '', album: '', durationMs: 60_000, source: 'r2', format: 'mp3',
    webdavPath: null, mime: 'audio/mpeg', sizeBytes: 0, coverUrl: null, lyric: null, hasLyric: false,
    tagIds: [], isFavorite: false, isPinned: false, playCount: 0, lastPlayedAt: null, contentHash: null,
    createdAt: 0, updatedAt: 0,
    ...overrides,
  } as MusicTrack
}

async function render(tracks: MusicTrack[], tags: MusicTag[] = []): Promise<void> {
  useMusic.setState({ insightsOpen: true, tracks, tags })
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicInsightsModal))
  })
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ insightsOpen: false, tracks: [], tags: [] })
})

describe('the statistics panel', () => {
  it('draws nothing until it is opened', async () => {
    useMusic.setState({ insightsOpen: false, tracks: [track('a', { playCount: 3 })] })
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(createElement(MusicInsightsModal))
    })
    expect(document.body.textContent).toBe('')
  })

  // The weekly section reads a stamp, not a log, so the panel says which of the two it is showing
  // instead of letting the reader assume a per-play timeline.
  it('names the weekly section as a last-play grouping and shows the rankings once there is listening', async () => {
    await render([
      track('a', { artist: 'Alpha', playCount: 4, lastPlayedAt: Date.now() }),
      track('b', { artist: 'Beta' }),
    ], [{ id: 't1', name: 'rock' } as MusicTag])
    const text = document.body.textContent ?? ''
    expect(text).toContain(t('music.insights_by_week'))
    expect(text).toContain(t('music.insights_week_note'))
    expect(text).toContain(t('music.insights_by_artist'))
    expect(text).toContain('Alpha')
    expect(text).toContain(t('music.insights_stat_never_played'))
  })

  it('says so in words when nothing has been played', async () => {
    await render([track('a'), track('b')])
    const text = document.body.textContent ?? ''
    expect(text).toContain(t('music.insights_empty'))
    expect(text).not.toContain(t('music.insights_by_week'))
  })
})
