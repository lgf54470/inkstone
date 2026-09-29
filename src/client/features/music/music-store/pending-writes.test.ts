import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MusicPlaylistDetail, MusicTrack } from '@shared/types'
import type { MusicPendingWrite } from '../../../lib/db'

vi.mock('../../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api')>()),
  api: {
    music: {
      // The replay only cares that the promise settled, so the body is never read — it is typed as
      // the call's own return so the stubs stay assignable to the real signatures.
      patchTrack: vi.fn(async () => null as unknown as MusicTrack),
      patchPlaylist: vi.fn(async () => null as unknown as MusicPlaylistDetail),
    },
  },
}))
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))
vi.mock('../../../lib/db', () => ({
  localDb: {
    getMusicWrites: vi.fn(async () => []),
    enqueueMusicWrite: vi.fn(async () => {}),
    completeMusicWrite: vi.fn(async () => {}),
    markMusicWriteFailure: vi.fn(async () => {}),
  },
}))

import { ApiError, api } from '../../../lib/api'
import { localDb } from '../../../lib/db'
import { toastMusicNotice } from '../music-feedback'
import { flushMusicWrites, isOfflineError, pendingMusicWriteCount, queueMusicWrite } from './pending-writes'

function pending(overrides: Partial<MusicPendingWrite> & { id: string }): MusicPendingWrite {
  return {
    kind: 'trackFlags',
    targetId: 'a',
    payload: { isFavorite: true },
    attempts: 0,
    createdAt: 1,
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(localDb.getMusicWrites).mockReset().mockResolvedValue([])
  vi.mocked(localDb.enqueueMusicWrite).mockClear()
  vi.mocked(localDb.completeMusicWrite).mockClear()
  vi.mocked(localDb.markMusicWriteFailure).mockClear()
  vi.mocked(api.music.patchTrack).mockReset().mockResolvedValue(null as unknown as MusicTrack)
  vi.mocked(api.music.patchPlaylist).mockReset().mockResolvedValue(null as unknown as MusicPlaylistDetail)
  vi.mocked(toastMusicNotice).mockClear()
})

describe('classifying a failed write', () => {
  it('treats a request that never arrived as offline', () => {
    expect(isOfflineError(new ApiError(0, 'offline', 'Failed to fetch'))).toBe(true)
  })

  // A refusal is an answer about the value; deferring it would only earn the same refusal later.
  it('does not treat the server answering as offline', () => {
    expect(isOfflineError(new ApiError(403, 'forbidden', 'nope'))).toBe(false)
    expect(isOfflineError(new ApiError(409, 'conflict', 'stale'))).toBe(false)
    expect(isOfflineError(new Error('Failed to fetch'))).toBe(false)
    expect(isOfflineError(null)).toBe(false)
  })
})

describe('queueing an intent', () => {
  it('names the entry after its target and says the write is waiting', async () => {
    await queueMusicWrite({ kind: 'playlistFlags', targetId: 'p1', payload: { isPinned: true } })
    expect(localDb.enqueueMusicWrite).toHaveBeenCalledWith(expect.objectContaining({
      id: 'playlistFlags:p1',
      kind: 'playlistFlags',
      targetId: 'p1',
      payload: { isPinned: true },
      attempts: 0,
    }))
    expect(toastMusicNotice).toHaveBeenCalledWith('music.saved_offline')
  })

  it('counts what is still waiting', async () => {
    vi.mocked(localDb.getMusicWrites).mockResolvedValue([pending({ id: 'trackFlags:a' })])
    expect(await pendingMusicWriteCount()).toBe(1)
  })
})

describe('replaying the queue', () => {
  it('sends each entry to the endpoint its kind names, oldest first', async () => {
    vi.mocked(localDb.getMusicWrites).mockResolvedValue([
      pending({ id: 'playlistFlags:p1', kind: 'playlistFlags', targetId: 'p1', createdAt: 20, payload: { isPinned: true } }),
      pending({ id: 'trackFlags:a', targetId: 'a', createdAt: 10 }),
    ])
    const dropped = await flushMusicWrites()
    expect(api.music.patchTrack).toHaveBeenCalledWith('a', { isFavorite: true })
    expect(api.music.patchPlaylist).toHaveBeenCalledWith('p1', { isPinned: true })
    expect(vi.mocked(api.music.patchTrack).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.music.patchPlaylist).mock.invocationCallOrder[0]!,
    )
    expect(vi.mocked(localDb.completeMusicWrite).mock.calls.map((call) => call[0])).toEqual(['trackFlags:a', 'playlistFlags:p1'])
    expect(dropped).toBe(0)
  })

  it('stops at the first offline failure and keeps the rest of the queue', async () => {
    vi.mocked(localDb.getMusicWrites).mockResolvedValue([
      pending({ id: 'trackFlags:a', targetId: 'a', createdAt: 10 }),
      pending({ id: 'trackFlags:b', targetId: 'b', createdAt: 20 }),
    ])
    vi.mocked(api.music.patchTrack).mockRejectedValueOnce(new ApiError(0, 'offline', 'Failed to fetch'))
    const dropped = await flushMusicWrites()
    expect(api.music.patchTrack).toHaveBeenCalledTimes(1)
    expect(localDb.markMusicWriteFailure).toHaveBeenCalledWith('trackFlags:a', 'Failed to fetch')
    expect(localDb.completeMusicWrite).not.toHaveBeenCalled()
    expect(dropped).toBe(0)
  })

  // One target the server will never accept cannot be allowed to block every write behind it.
  it('drops a refusal and carries on to the next entry', async () => {
    vi.mocked(localDb.getMusicWrites).mockResolvedValue([
      pending({ id: 'trackFlags:a', targetId: 'a', createdAt: 10 }),
      pending({ id: 'trackFlags:b', targetId: 'b', createdAt: 20 }),
    ])
    vi.mocked(api.music.patchTrack)
      .mockRejectedValueOnce(new ApiError(404, 'not_found', 'gone'))
      .mockResolvedValueOnce(null as unknown as MusicTrack)
    const dropped = await flushMusicWrites()
    expect(dropped).toBe(1)
    expect(vi.mocked(localDb.completeMusicWrite).mock.calls.map((call) => call[0])).toEqual(['trackFlags:a', 'trackFlags:b'])
  })

  it('does nothing at all when there is nothing waiting', async () => {
    expect(await flushMusicWrites()).toBe(0)
    expect(api.music.patchTrack).not.toHaveBeenCalled()
  })
})
