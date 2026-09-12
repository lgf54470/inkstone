import { describe, expect, it } from 'vitest'
import { pickArtworkUrl } from './music-cover-match'

const ARTWORK = 'https://is1-ssl.mzstatic.com/image/thumb/Music1/cover.jpg/100x100bb.jpg'
const OTHER_ARTWORK = 'https://is1-ssl.mzstatic.com/image/thumb/Music2/cover.jpg/100x100bb.jpg'
const LARGE_ARTWORK = ARTWORK.replace('100x100bb', '600x600bb')

function catalogue(trackName: string, artistName: string, artworkUrl100 = ARTWORK): Record<string, string> {
  return { trackName, artistName, artworkUrl100 }
}

describe('pickArtworkUrl', () => {
  it('upgrades the artwork of an exact match to the large rendition', () => {
    expect(pickArtworkUrl('谪仙', '伊格赛听', [catalogue('谪仙', '伊格赛听')])).toBe(LARGE_ARTWORK)
  })

  it('matches catalogue qualifiers the file name does not carry', () => {
    expect(pickArtworkUrl('谪仙', '伊格赛听', [catalogue('谪仙 (DJ名龙 Mix)', '伊格赛听 & Li Ye')])).toBe(LARGE_ARTWORK)
  })

  it('matches an import that folded the artist into the title', () => {
    expect(pickArtworkUrl('樱花树下的约定（完整版）-旺仔小乔', '', [catalogue('樱花树下的约定', 'Wang Zi Xiao Qiao')])).toBe(LARGE_ARTWORK)
  })

  it('prefers the result whose artist matches', () => {
    const results = [catalogue('左手指月 (片尾曲)', 'Sa Ding Ding', OTHER_ARTWORK), catalogue('左手指月', '萨顶顶')]
    expect(pickArtworkUrl('左手指月', '萨顶顶', results)).toBe(LARGE_ARTWORK)
  })

  it('refuses a result for a different song', () => {
    expect(pickArtworkUrl('原点-西单女孩', '', [catalogue('我是西单女孩', '西单女孩')])).toBeNull()
    expect(pickArtworkUrl('原点', '西单女孩', [])).toBeNull()
    expect(pickArtworkUrl('原点', '', [catalogue('原点', '西单女孩', '')])).toBeNull()
  })
})
