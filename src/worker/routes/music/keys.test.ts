import { describe, expect, it } from 'vitest'
import { isDerivedMusicObjectKey, resolveMusicTrackType, safeStreamMime } from './keys'

describe('music track type resolution', () => {
  it('lets a declared video mime decide the container', () => {
    expect(resolveMusicTrackType('clip.mp4', 'video/mp4')).toEqual({ format: 'mp4', mime: 'video/mp4' })
    expect(resolveMusicTrackType('clip.webm', 'video/webm')).toEqual({ format: 'webm', mime: 'video/webm' })
  })

  it('canonicalizes a vendor video type onto the mime the decoder answers to', () => {
    expect(resolveMusicTrackType('clip.m4v', 'video/x-m4v')).toEqual({ format: 'mp4', mime: 'video/mp4' })
  })

  it('keeps an audio-in-mp4 on the audio container uploads always used', () => {
    expect(resolveMusicTrackType('song.mp4', 'audio/mp4')).toEqual({ format: 'm4a', mime: 'audio/mp4' })
    expect(resolveMusicTrackType('song.mp4', '')).toEqual({ format: 'm4a', mime: 'audio/mp4' })
  })

  it('reads the unambiguous video extensions even when the client declared nothing', () => {
    expect(resolveMusicTrackType('concert.MOV', '')).toEqual({ format: 'mov', mime: 'video/quicktime' })
    expect(resolveMusicTrackType('clip.m4v', '')).toEqual({ format: 'mp4', mime: 'video/mp4' })
  })

  it('rejects a video type no browser decodes instead of storing it as audio', () => {
    expect(resolveMusicTrackType('clip.avi', 'video/x-msvideo')).toBeNull()
    expect(resolveMusicTrackType('notes.txt', 'text/plain')).toBeNull()
  })

  it('serves a video container inline and keeps unknown types as downloads', () => {
    expect(safeStreamMime('video/mp4')).toBe('video/mp4')
    expect(safeStreamMime('Video/QuickTime; codecs=hvc1')).toBe('video/quicktime')
    expect(safeStreamMime('video/x-msvideo')).toBeNull()
    expect(safeStreamMime('text/html')).toBeNull()
    expect(safeStreamMime(null)).toBeNull()
  })

  it('derives a delete key only from the container the row was stored under', () => {
    const createdAt = 1_700_000_000_000
    const day = new Date(createdAt).toISOString().slice(0, 10)
    expect(isDerivedMusicObjectKey('t1', createdAt, `music/${day}/t1.mp4`)).toBe(true)
    expect(isDerivedMusicObjectKey('t1', createdAt, `music/${day}/t1.mov`)).toBe(true)
    expect(isDerivedMusicObjectKey('t1', createdAt, `music/${day}/t2.mp4`)).toBe(false)
    expect(isDerivedMusicObjectKey('t1', createdAt, `music/${day}/t1.m4v`)).toBe(false)
  })
})
