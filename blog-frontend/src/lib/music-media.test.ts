import { describe, expect, it } from 'vitest'
import { isVideoMime, mediaKindOfMime } from './music-media'

describe('isVideoMime', () => {
  it('reads any video subtype as a clip', () => {
    for (const mime of ['video/mp4', 'video/webm', 'video/quicktime', 'VIDEO/M4V']) {
      expect(isVideoMime(mime)).toBe(true)
    }
  })

  it('reads audio, empty and missing as not a clip', () => {
    for (const mime of ['audio/mpeg', '', 'application/octet-stream']) {
      expect(isVideoMime(mime)).toBe(false)
    }
    expect(isVideoMime(null)).toBe(false)
    expect(isVideoMime(undefined)).toBe(false)
  })

  it('never reads a container extension as a verdict', () => {
    expect(isVideoMime('mp4')).toBe(false)
  })
})

describe('mediaKindOfMime', () => {
  it('maps the mime to the element that can carry it', () => {
    expect(mediaKindOfMime('video/webm')).toBe('video')
    expect(mediaKindOfMime('audio/mpeg')).toBe('audio')
    expect(mediaKindOfMime('')).toBe('audio')
  })
})
