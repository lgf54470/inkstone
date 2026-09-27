import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      music: {
        ...actual.api.music,
        listPodcastFeeds: vi.fn(async () => ({ feeds: [{ id: 'pf-1', title: 'A Show', url: 'https://feeds.example.com/show.xml', description: '', createdAt: 1, updatedAt: 1 }] })),
        createPodcastFeed: vi.fn(async (input: { url: string }) => ({ id: 'pf-2', title: 'podcast.example.org', url: input.url, description: '', createdAt: 1, updatedAt: 1 })),
        deletePodcastFeed: vi.fn(async () => ({ ok: true })),
        listPodcastEpisodes: vi.fn(async () => ({ episodes: [] })),
      },
    },
  }
})
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))

import { api } from '../../../lib/api'
import { musicStoreStub } from './store.test-helpers'
import { createPodcastFeed, deletePodcastFeed, loadPodcastEpisodes, loadPodcastFeeds } from './podcast'
import type { MusicStoreState } from './types'

function makeStore() {
  return musicStoreStub({ podcastFeeds: [], podcastFeedsLoading: false } as unknown as MusicStoreState)
}

beforeEach(() => {
  vi.clearAllMocks()
})

// FB-U6: both podcast listings had the same defect the Alist one did — a failure came back as an
// empty list, so the panel could not tell "could not load" from "you have none".
describe('podcast failures are not empty lists (FB-U6)', () => {
  it('holds a feed failure for the panel to say out loud', async () => {
    vi.mocked(api.music.listPodcastFeeds).mockRejectedValueOnce(new Error('offline'))
    const store = makeStore()
    await loadPodcastFeeds(store.set)
    expect(store.get().podcastFeedsError).toBe('offline')
  })

  it('clears the feed failure on the next load', async () => {
    vi.mocked(api.music.listPodcastFeeds).mockRejectedValueOnce(new Error('offline'))
    const store = makeStore()
    await loadPodcastFeeds(store.set)
    await loadPodcastFeeds(store.set)
    expect(store.get().podcastFeedsError).toBeNull()
  })

  it('keeps the feed open when its episodes fail, so the retry has somewhere to live', async () => {
    vi.mocked(api.music.listPodcastEpisodes).mockRejectedValueOnce(new Error('offline'))
    const store = makeStore()
    await loadPodcastEpisodes(store.set, 'pf-1')
    expect(store.get().podcastEpisodesError).toBe('offline')
    expect(store.get().podcastEpisodesFeedId).toBe('pf-1')
  })
})

describe('podcast feed store (FEA-A2-1)', () => {
  it('loads the subscription list', async () => {
    const store = makeStore()
    await loadPodcastFeeds(store.set)
    expect(store.get().podcastFeeds).toHaveLength(1)
    expect(store.get().podcastFeeds[0]?.title).toBe('A Show')
  })

  it('creates a subscription and appends it', async () => {
    const store = makeStore()
    await createPodcastFeed(store.set, { url: 'https://podcast.example.org/feed.rss' })
    expect(api.music.createPodcastFeed).toHaveBeenCalledWith({ url: 'https://podcast.example.org/feed.rss' })
    expect(store.get().podcastFeeds).toHaveLength(1)
  })

  it('unsubscribes and drops the feed from the list', async () => {
    const store = makeStore()
    store.set({ podcastFeeds: [{ id: 'pf-1', title: 'A Show', url: 'https://feeds.example.com/show.xml', description: '', createdAt: 1, updatedAt: 1 }] })
    await deletePodcastFeed(store.set, 'pf-1')
    expect(store.get().podcastFeeds).toEqual([])
  })
})
