import { describe, expect, it } from 'vitest'
import { LIMITS } from '@shared/constants'
import { ApiError } from '../../lib/errors'
import { MUSIC_MAX_BYTES } from './keys'
import { assertPlaylistHasRoom } from './playlists'
import { KV_VALUE_MAX_BYTES } from './storage'
import { assertUploadSize } from './upload'

// A rejection only tells the reader what happened if it names its own reason, so these assert
// the status and code a boundary hands back rather than the English sentence it carries: the
// client turns the code into the localized copy, and a borrowed generic one rewrites the story
// (a full playlist read as "the content is too large").
function rejection(run: () => void): string {
  try {
    run()
    return 'accepted'
  } catch (error) {
    return error instanceof ApiError ? `${error.status} ${error.code}` : 'not an ApiError'
  }
}

describe('upload size limits', () => {
  it('names the media size cap when a file is too big for the deployment', () => {
    expect(rejection(() => assertUploadSize(MUSIC_MAX_BYTES + 1, 'r2'))).toBe('413 media_too_large')
    expect(rejection(() => assertUploadSize(KV_VALUE_MAX_BYTES + 1, 'kv'))).toBe('413 media_too_large')
  })

  it('accepts a file exactly at the cap', () => {
    expect(rejection(() => assertUploadSize(MUSIC_MAX_BYTES, 'r2'))).toBe('accepted')
  })
})

describe('playlist capacity', () => {
  it('names the playlist cap instead of the payload size', () => {
    expect(rejection(() => assertPlaylistHasRoom(LIMITS.musicPlaylistItemsMax, 1))).toBe('413 playlist_full')
    expect(rejection(() => assertPlaylistHasRoom(LIMITS.musicPlaylistItemsMax - 2, 3))).toBe('413 playlist_full')
  })

  it('leaves the last free slot usable', () => {
    expect(rejection(() => assertPlaylistHasRoom(LIMITS.musicPlaylistItemsMax - 1, 1))).toBe('accepted')
    expect(rejection(() => assertPlaylistHasRoom(LIMITS.musicPlaylistItemsMax - 2, 2))).toBe('accepted')
  })
})
