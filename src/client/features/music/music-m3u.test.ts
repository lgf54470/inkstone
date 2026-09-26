import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { MusicTrack } from '@shared/types'
import { initI18n } from '../../lib/i18n'
import { matchM3uTracks, parseM3u } from './music-m3u'
import { useMusic } from './music-store'
import { downloadFileName } from './music-utils'

beforeAll(async () => {
  await initI18n()
})

afterEach(() => {
  useMusic.setState({ queue: [], currentIndex: 0 })
})

function track(id: string, artist: string, title: string): MusicTrack {
  return {
    id, title, artist, album: '', durationMs: 1000, source: 'r2', format: 'mp3',
    webdavPath: null, mime: 'audio/mpeg', sizeBytes: 0, coverUrl: null, lyric: null,
    hasLyric: false, tagIds: [], isFavorite: false, isPinned: false, playCount: 0,
    lastPlayedAt: null, contentHash: null, createdAt: 0, updatedAt: 0,
  }
}

const LIBRARY = [
  track('t1', 'Ann', 'Moonlight'),
  track('t2', 'Bob', 'Rivers'),
  track('t3', '', 'Untitled Take'),
]

describe('M3U parsing (F-5)', () => {
  it('pairs each extended info line with the path that follows it', () => {
    const entries = parseM3u([
      '#EXTM3U',
      '#EXTINF:210,Ann - Moonlight',
      'Ann - Moonlight.mp3',
      '',
      '#EXTINF:180,Bob - Rivers',
      'C:\\Music\\Rivers.mp3',
    ].join('\n'))
    expect(entries).toEqual([
      { title: 'Ann - Moonlight', target: 'Ann - Moonlight.mp3' },
      { title: 'Bob - Rivers', target: 'C:\\Music\\Rivers.mp3' },
    ])
  })

  it('keeps a bare path list and ignores other directives', () => {
    const entries = parseM3u(['#EXTM3U', '#PLAYLIST:Songs', 'plain.mp3'].join('\n'))
    expect(entries).toEqual([{ title: null, target: 'plain.mp3' }])
  })

  it('finds nothing in a file without entries', () => {
    expect(parseM3u('#EXTM3U\n\n')).toEqual([])
  })
})

describe('M3U matching (F-5)', () => {
  it('matches what the export wrote, in file order', () => {
    const m3u = [
      '#EXTM3U',
      '#EXTINF:1,Bob - Rivers',
      downloadFileName(LIBRARY[1]!),
      '#EXTINF:1,Ann - Moonlight',
      downloadFileName(LIBRARY[0]!),
    ].join('\n')
    expect(matchM3uTracks(parseM3u(m3u), LIBRARY).map((entry) => entry.id)).toEqual(['t2', 't1'])
  })

  it('matches a bare filename and a title without an artist', () => {
    const m3u = ['/srv/music/Rivers.mp3', '#EXTINF:1,Untitled Take', 'whatever.mp3'].join('\n')
    expect(matchM3uTracks(parseM3u(m3u), LIBRARY).map((entry) => entry.id)).toEqual(['t2', 't3'])
  })

  it('leaves entries with no counterpart out of the result', () => {
    const m3u = ['#EXTINF:1,Unknown - Song', 'Unknown - Song.mp3'].join('\n')
    expect(matchM3uTracks(parseM3u(m3u), LIBRARY)).toEqual([])
  })
})

describe('queueing a whole playlist (F-5)', () => {
  it('appends every match once and skips what is already queued', () => {
    useMusic.setState({ queue: ['t2'], currentIndex: 0 })
    const added = useMusic.getState().addManyToQueue(['t1', 't2', 't3'])
    expect(added).toBe(2)
    expect(useMusic.getState().queue).toEqual(['t2', 't1', 't3'])
  })

  it('announces nothing when every id was already there', () => {
    useMusic.setState({ queue: ['t1', 't2'], currentIndex: 0 })
    expect(useMusic.getState().addManyToQueue(['t1', 't2'])).toBe(0)
    expect(useMusic.getState().queue).toEqual(['t1', 't2'])
  })
})
