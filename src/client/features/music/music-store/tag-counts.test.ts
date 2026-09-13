import { describe, expect, it, vi } from 'vitest'
import type { MusicTag, MusicTrack } from '@shared/types'
import { buildTagTree } from '../../../lib/tag-tree'
import { toTagRows } from '../music-tag-rows'
import { deleteTag } from './library-collections'
import { buildTagCounts } from './selectors'
import type { MusicStoreState } from './types'

vi.mock('../../../lib/api', () => ({
  api: { music: { deleteTag: vi.fn().mockResolvedValue({ ok: true }) } },
}))
vi.mock('../music-feedback', () => ({ toastMusic: vi.fn(), toastMusicError: vi.fn(), toastMusicNotice: vi.fn(), toastUploadError: vi.fn() }))
vi.mock('../music-metadata', () => ({ readFileMetadata: vi.fn(), readDurationMs: vi.fn(), scanTrackMetadata: vi.fn() }))
vi.mock('../music-probe', () => ({ readDurationMs: vi.fn() }))

function tag(id: string, name: string, parentId: string | null): MusicTag {
  return { id, name, color: null, parentId, isPinned: false, sortOrder: 0, createdAt: 1 }
}

function track(id: string, tagIds: string[]): MusicTrack {
  return {
    id, title: id, artist: '', album: '', durationMs: 1, source: 'r2', objectKey: '', mime: 'audio/mpeg',
    sizeBytes: 1, coverUrl: null, lyric: null, tagIds, isFavorite: false, isPinned: false, playCount: 0,
    createdAt: 1, updatedAt: 1,
  }
}

function makeStore(initial: Partial<MusicStoreState>) {
  let state = initial as MusicStoreState
  return {
    get: () => state,
    set: (patch: unknown) => {
      const next = typeof patch === 'function'
        ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state)
        : (patch as Partial<MusicStoreState>)
      state = { ...state, ...next }
    },
    state: () => state,
  }
}

describe('music tag counts', () => {
  it('counts a child-tagged track once under the parent instead of double-rolling it up', () => {
    const tags = [tag('rock', 'rock', null), tag('pop', 'pop', 'rock')]
    const tracks = [track('moonlight', ['pop'])]
    const rows = toTagRows(tags, buildTagCounts(tracks))
    const parent = buildTagTree(rows).find((node) => node.fullPath === 'rock')!
    expect(parent.totalCount).toBe(1)
    expect(parent.children[0]!.count).toBe(1)
  })

  it('keeps direct and descendant counts separate for the tree roll-up', () => {
    const tags = [tag('rock', 'rock', null), tag('pop', 'pop', 'rock')]
    const tracks = [track('a', ['rock', 'pop']), track('b', ['pop'])]
    const counts = buildTagCounts(tracks)
    expect(counts.get('rock')).toBe(1)
    expect(counts.get('pop')).toBe(2)
    const parent = buildTagTree(toTagRows(tags, counts)).find((node) => node.fullPath === 'rock')!
    expect(parent.totalCount).toBe(3)
  })
})

describe('deleteTag cascades', () => {
  it('re-parents children to the deleted tag\'s parent and strips it from tracks', async () => {
    const store = makeStore({
      tags: [tag('rock', 'rock', null), tag('pop', 'pop', 'rock')],
      tracks: [track('moonlight', ['pop', 'rock'])],
      scope: { kind: 'tag', tagId: 'rock' },
    })
    await deleteTag(store.set as never, 'rock')
    expect(store.state().tags.map((entry) => [entry.id, entry.parentId])).toEqual([['pop', null]])
    expect(store.state().tracks[0]!.tagIds).toEqual(['pop'])
    expect(store.state().scope).toEqual({ kind: 'all' })
  })

  it('leaves a child in place when its new parent already has a same-name tag', async () => {
    const store = makeStore({
      tags: [tag('rock', 'rock', null), tag('pop', 'pop', 'rock'), tag('pop2', 'pop', null)],
      tracks: [track('moonlight', ['pop'])],
      scope: { kind: 'all' },
    })
    await deleteTag(store.set as never, 'rock')
    const child = store.state().tags.find((entry) => entry.id === 'pop')!
    expect(child.parentId).toBe('rock')
    expect(store.state().tracks[0]!.tagIds).toEqual(['pop'])
  })
})
