import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { useMusic } from './index'
import { useVisibleTracks } from './selectors'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

function track(id: string, title: string): MusicTrack {
  return {
    id, title, artist: '', album: '', durationMs: 1000, source: 'r2', format: 'mp3',
    webdavPath: null, mime: 'audio/mpeg', sizeBytes: 0, coverUrl: null, lyric: null,
    hasLyric: false, tagIds: [], isFavorite: false, isPinned: false, playCount: 0,
    lastPlayedAt: null, contentHash: null, createdAt: 0, updatedAt: 0,
  }
}

let root: Root | null = null

// The list is ranked by the selector hook, so the probe renders exactly what the hook hands
// back: a stale memo here shows up as the old order, whatever the header arrow says.
function Probe(): ReactElement {
  return createElement('ul', null, useVisibleTracks().map((entry) => createElement('li', { key: entry.id }, entry.title)))
}

function rendered(): string[] {
  return [...document.querySelectorAll('li')].map((item) => item.textContent ?? '')
}

async function mountProbe(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(Probe))
  })
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

describe('useVisibleTracks', () => {
  it('follows a sort-direction flip that changes no other field', async () => {
    useMusic.setState({
      tracks: [track('b', 'Beta'), track('a', 'Alpha')],
      tags: [], playlists: [],
      scope: { kind: 'all' },
      query: '',
      sort: 'title',
      sortDirection: 'asc',
      sourceFilter: 'all',
      romanized: {},
    })
    await mountProbe()
    expect(rendered()).toEqual(['Alpha', 'Beta'])

    await act(async () => {
      useMusic.setState({ sortDirection: 'desc' })
    })

    expect(rendered()).toEqual(['Beta', 'Alpha'])
  })
})
