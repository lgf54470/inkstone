import { describe, expect, it } from 'vitest'
import { mediaAutoplays, mediaFit, mediaSrcIsSafe, resolveMediaSrc } from './media'
import type { MediaElement } from './types'

function media(over: Partial<MediaElement> = {}): MediaElement {
  return { id: 'm1', type: 'media', kind: 'video', src: 'https://example.com/a.mp4', x: 0, y: 0, w: 100, h: 100, ...over }
}

describe('mediaSrcIsSafe', () => {
  it('accepts web addresses, relative paths and media data URIs', () => {
    expect(mediaSrcIsSafe('https://example.com/clip.mp4')).toBe(true)
    expect(mediaSrcIsSafe('http://example.com/clip.mp4')).toBe(true)
    expect(mediaSrcIsSafe('/files/clip.mp4')).toBe(true)
    expect(mediaSrcIsSafe('assets/clip.mp4')).toBe(true)
    expect(mediaSrcIsSafe('data:video/mp4;base64,AAA')).toBe(true)
    expect(mediaSrcIsSafe('data:audio/mpeg;base64,AAA')).toBe(true)
  })

  it('refuses every other scheme, including data URIs that are not media', () => {
    expect(mediaSrcIsSafe('javascript:alert(1)')).toBe(false)
    expect(mediaSrcIsSafe('JavaScript:alert(1)')).toBe(false)
    expect(mediaSrcIsSafe('file:///etc/passwd')).toBe(false)
    expect(mediaSrcIsSafe('blob:https://example.com/x')).toBe(false)
    expect(mediaSrcIsSafe('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(mediaSrcIsSafe('')).toBe(false)
  })
})

describe('resolveMediaSrc', () => {
  it('reads asset bytes out of the document table', () => {
    expect(resolveMediaSrc('asset:clip', { clip: 'data:video/mp4;base64,AAA' })).toBe(
      'data:video/mp4;base64,AAA',
    )
  })

  it('resolves an asset key with no entry to nothing, so the frame can say so', () => {
    expect(resolveMediaSrc('asset:missing', {})).toBe('')
    expect(resolveMediaSrc('asset:missing', undefined)).toBe('')
  })

  it('keeps a safe source as written and drops an unsafe one', () => {
    expect(resolveMediaSrc('https://example.com/a.mp4')).toBe('https://example.com/a.mp4')
    expect(resolveMediaSrc('javascript:alert(1)')).toBe('')
  })
})

describe('mediaAutoplays', () => {
  it('starts only when the document asks and the reader has not asked for less motion', () => {
    expect(mediaAutoplays(media({ autoplay: true }), false)).toBe(true)
    expect(mediaAutoplays(media({ autoplay: true }), true)).toBe(false)
    expect(mediaAutoplays(media(), false)).toBe(false)
  })
})

describe('mediaFit', () => {
  it('fills the frame unless the document asks otherwise', () => {
    expect(mediaFit(media())).toBe('cover')
    expect(mediaFit(media({ fit: 'contain' }))).toBe('contain')
    expect(mediaFit(media({ fit: 'fill' }))).toBe('fill')
  })
})
