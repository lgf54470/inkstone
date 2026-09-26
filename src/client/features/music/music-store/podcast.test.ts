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
import { createPodcastFeed, deletePodcastFeed, loadPodcastFeeds } from './podcast'
import type { MusicStoreState } from './types'

function makeStore() {
  return musicStoreStub({ podcastFeeds: [], podcastFeedsLoading: false } as unknown as MusicStoreState)
}

beforeEach(() => {
  vi.clearAllMocks()
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
