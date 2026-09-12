import { describe, expect, it } from 'vitest'
import { musicRemotePath, normalizeMusicDir } from './music-path'

describe('music directory normalisation', () => {
  it('keeps a plain nested directory', () => {
    expect(normalizeMusicDir('music')).toBe('music')
    expect(normalizeMusicDir('Audio/Music')).toBe('Audio/Music')
    expect(normalizeMusicDir('  my music  ')).toBe('my music')
  })

  it('strips traversal, absolute and empty segments', () => {
    expect(normalizeMusicDir('/music/')).toBe('music')
    expect(normalizeMusicDir('../../etc')).toBe('etc')
    expect(normalizeMusicDir('music/../secret')).toBe('music/secret')
    expect(normalizeMusicDir('///')).toBe('music')
  })

  it('falls back for non-strings and unusable input', () => {
    expect(normalizeMusicDir(null)).toBe('music')
    expect(normalizeMusicDir(42)).toBe('music')
    expect(normalizeMusicDir('')).toBe('music')
    expect(normalizeMusicDir('..', 'fallback')).toBe('fallback')
  })

  it('joins a base directory with a relative file path', () => {
    expect(musicRemotePath('music', 'song.mp3')).toBe('music/song.mp3')
    expect(musicRemotePath('music/live', 'Album/track.mp3')).toBe('music/live/Album/track.mp3')
  })

  it('rejects traversal in the relative path', () => {
    expect(musicRemotePath('music', '../escape.mp3')).toBeNull()
    expect(musicRemotePath('music', 'a/../../b.mp3')).toBeNull()
    expect(musicRemotePath('music', 'a\\b.mp3')).toBeNull()
  })
})
