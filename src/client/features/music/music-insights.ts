import type { MusicTag, MusicTrack } from '@shared/types'

// One row of a ranking: how many tracks the group holds, how often they have been played, and how
// much listening those plays represent (`durationMs * playCount`, so a track with an unknown length
// contributes nothing rather than a guess).
export interface MusicInsightBucket {
  key: string
  label: string
  /** Only the weekly buckets carry one: the instant the bucket starts at, for locale formatting. */
  at?: number
  trackCount: number
  playCount: number
  listenedMs: number
}

export interface MusicInsights {
  totals: {
    tracks: number
    played: number
    neverPlayed: number
    plays: number
    listenedMs: number
    libraryMs: number
  }
  weeks: MusicInsightBucket[]
  artists: MusicInsightBucket[]
  tags: MusicInsightBucket[]
  tracks: MusicInsightBucket[]
}

export interface MusicInsightOptions {
  /** How many weekly buckets to keep, newest first. */
  weeks?: number
  /** How many rows each ranking keeps. */
  top?: number
}

const DEFAULT_WEEKS = 12
const DEFAULT_TOP = 10

// Weeks start on Monday because that is what a `Intl` week in most of this app's locales does, and
// the bucket edge has to agree with the label the reader sees rather than with a second convention
// invented here. Local midnight is the unit: `lastPlayedAt` is a server stamp in UTC, but "which
// week was that" is a question about the reader's calendar, so it is asked in local time.
export function weekStart(ts: number): number {
  const date = new Date(ts)
  date.setHours(0, 0, 0, 0)
  const weekday = (date.getDay() + 6) % 7
  return date.getTime() - weekday * 24 * 60 * 60 * 1000
}

function emptyBucket(key: string, label: string, at?: number): MusicInsightBucket {
  return { key, label, ...(at === undefined ? {} : { at }), trackCount: 0, playCount: 0, listenedMs: 0 }
}

// A track's plays are attributed to the group it belongs to, so the three rankings answer the same
// question ("what do I actually listen to") over three different groupings — and the weekly one
// answers a different one on purpose: it reads the *last play* stamp, because that is the only
// per-track time this library keeps. There is no per-play log to draw a true weekly timeline from,
// which is why the panel labels that section as last-played rather than as listening history.
export function buildInsights(tracks: MusicTrack[], tags: MusicTag[], options: MusicInsightOptions = {}): MusicInsights {
  const weekLimit = options.weeks ?? DEFAULT_WEEKS
  const topLimit = options.top ?? DEFAULT_TOP
  const tagNames = new Map(tags.map((tag) => [tag.id, tag.name]))

  const artists = new Map<string, MusicInsightBucket>()
  const tagBuckets = new Map<string, MusicInsightBucket>()
  const weeks = new Map<number, MusicInsightBucket>()
  const played: MusicInsightBucket[] = []
  const totals = { tracks: tracks.length, played: 0, neverPlayed: 0, plays: 0, listenedMs: 0, libraryMs: 0 }

  for (const track of tracks) {
    const listenedMs = track.durationMs > 0 ? track.durationMs * track.playCount : 0
    totals.plays += track.playCount
    totals.listenedMs += listenedMs
    totals.libraryMs += track.durationMs
    if (track.playCount > 0) totals.played += 1
    else totals.neverPlayed += 1

    accumulate(artists, `artist:${track.artist}`, track.artist, track, listenedMs)

    // A tag id with no tag behind it has no name to group under; the tag manager is where that
    // dangling reference shows up, so the ranking skips it instead of inventing a row for it.
    for (const tagId of track.tagIds) {
      const name = tagNames.get(tagId)
      if (name === undefined) continue
      accumulate(tagBuckets, `tag:${tagId}`, name, track, listenedMs)
    }

    if (track.lastPlayedAt !== null) {
      const start = weekStart(track.lastPlayedAt)
      const bucket = weeks.get(start) ?? emptyBucket(`week:${start}`, new Date(start).toISOString().slice(0, 10), start)
      weeks.set(start, bucket)
      add(bucket, track, listenedMs)
    }

    if (track.playCount > 0) {
      played.push({ key: `track:${track.id}`, label: track.title, trackCount: 1, playCount: track.playCount, listenedMs })
    }
  }

  return {
    totals,
    weeks: [...weeks.values()].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, weekLimit),
    artists: rank(artists, topLimit),
    tags: rank(tagBuckets, topLimit),
    tracks: played.sort((a, b) => b.playCount - a.playCount || a.label.localeCompare(b.label)).slice(0, topLimit),
  }
}

function accumulate(
  buckets: Map<string, MusicInsightBucket>,
  key: string,
  label: string,
  track: MusicTrack,
  listenedMs: number,
): void {
  const bucket = buckets.get(key) ?? emptyBucket(key, label)
  buckets.set(key, bucket)
  add(bucket, track, listenedMs)
}

function add(bucket: MusicInsightBucket, track: MusicTrack, listenedMs: number): void {
  bucket.trackCount += 1
  bucket.playCount += track.playCount
  bucket.listenedMs += listenedMs
}

// Ties break on the name so two groups with the same play count keep a stable, readable order
// instead of whatever the Map happened to yield first.
function rank(buckets: Map<string, MusicInsightBucket>, limit: number): MusicInsightBucket[] {
  return [...buckets.values()]
    .sort((a, b) => b.playCount - a.playCount || b.trackCount - a.trackCount || a.label.localeCompare(b.label))
    .slice(0, limit)
}

// The monthly/weekly granularity is only meaningful over stamps that exist; a library nobody has
// played yet has no buckets at all, which the panel says in words rather than drawing an empty axis.
export function hasListening(insights: MusicInsights): boolean {
  return insights.totals.plays > 0
}
