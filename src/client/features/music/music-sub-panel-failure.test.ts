import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { t } from '../../lib/i18n'
import { MusicAlistModal } from './music-alist-modal'
import { MusicPodcastModal } from './music-podcast-modal'
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

async function mount(element: React.ReactElement): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(element)
  })
}

function retryButton(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find((button) => button.textContent === t('common.retry')) as HTMLButtonElement | undefined
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

// FB-U6: a failed listing and an empty account used to read the same. These pin the other half of the
// store contract — the panel names the failure, stops claiming the list is empty, and wires the retry
// to the loader that can actually change the answer.
describe('sub-panel failures (FB-U6)', () => {
  it('an Alist listing that failed says so and offers the retry', async () => {
    const load = vi.fn(() => Promise.resolve())
    useMusic.setState({ alistServers: [], alistServersLoading: false, alistServersError: 'offline', loadAlistServers: load })
    await mount(createElement(MusicAlistModal, { open: true, onClose: () => {} }))
    expect(document.body.textContent).toContain('offline')
    expect(document.body.textContent).not.toContain(t('music.alist_no_servers'))
    const before = load.mock.calls.length
    await act(async () => { retryButton()?.click() })
    expect(load.mock.calls.length).toBe(before + 1)
  })

  it('a podcast feed listing that failed says so too', async () => {
    const load = vi.fn(() => Promise.resolve())
    useMusic.setState({ podcastFeeds: [], podcastFeedsLoading: false, podcastFeedsError: 'offline', loadPodcastFeeds: load })
    await mount(createElement(MusicPodcastModal, { open: true, onClose: () => {} }))
    expect(document.body.textContent).toContain('offline')
    expect(document.body.textContent).not.toContain(t('music.podcast_no_feeds'))
    const before = load.mock.calls.length
    await act(async () => { retryButton()?.click() })
    expect(load.mock.calls.length).toBe(before + 1)
  })

  it('an episode listing that failed keeps the feed open and retries in place', async () => {
    const load = vi.fn(() => Promise.resolve())
    const feed = { id: 'pf-1', title: 'A Show', url: 'https://feeds.example.com/show.xml', description: '', createdAt: 1, updatedAt: 1 }
    useMusic.setState({
      podcastFeeds: [feed],
      podcastFeedsLoading: false,
      podcastFeedsError: null,
      podcastEpisodesFeedId: feed.id,
      podcastEpisodes: [],
      podcastEpisodesLoading: false,
      podcastEpisodesError: 'offline',
      loadPodcastEpisodes: load,
    })
    await mount(createElement(MusicPodcastModal, { open: true, onClose: () => {} }))
    expect(document.body.textContent).toContain('offline')
    expect(document.body.textContent).not.toContain(t('music.podcast_episodes_empty'))
    const before = load.mock.calls.length
    await act(async () => { retryButton()?.click() })
    expect(load.mock.calls.length).toBe(before + 1)
  })
})
