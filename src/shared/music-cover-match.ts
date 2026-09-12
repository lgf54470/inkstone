const ARTWORK_SUFFIX = '100x100bb'
const ARTWORK_SIZE = '600x600bb'
const MIN_MATCH_LENGTH = 2

export interface CatalogueTrack {
  trackName?: string
  artistName?: string
  artworkUrl100?: string
}

// Catalogue titles carry qualifiers the file name does not — "Song (DJ Mix)" against "Song" —
// and some imports fold the artist into the title, so both sides lose brackets and punctuation.
export function pickArtworkUrl(title: string, artist: string, results: CatalogueTrack[]): string | null {
  const wanted = normalizeName(title)
  const wantedArtist = normalizeName(artist)
  if (wanted.length < MIN_MATCH_LENGTH) return null
  let best: { score: number; url: string } | null = null
  for (const result of results) {
    const name = normalizeName(result.trackName ?? '')
    const url = result.artworkUrl100
    if (!url || !isTitleMatch(wanted, name)) continue
    const artistMatches = Boolean(wantedArtist) && normalizeName(result.artistName ?? '').includes(wantedArtist)
    const score = (name === wanted ? 2 : 0) + (artistMatches ? 1 : 0)
    if (!best || score > best.score) best = { score, url }
  }
  return best ? best.url.replace(ARTWORK_SUFFIX, ARTWORK_SIZE) : null
}

function isTitleMatch(wanted: string, name: string): boolean {
  if (name.length < MIN_MATCH_LENGTH) return false
  return name.includes(wanted) || wanted.includes(name)
}

// Full width brackets, separators and punctuation differ between file names and catalogue titles.
function normalizeName(value: string): string {
  const unqualified = value.toLowerCase().replace(/[\uff08(\[\u3010][^\uff09)\]\u3011]*[\uff09)\]\u3011]/g, '')
  return unqualified.replace(/[\s\-_\u00b7\u3001,\uff0c.\u3002!\uff01?\uff1f'"\u201c\u201d\u2018\u2019]/g, '')
}
