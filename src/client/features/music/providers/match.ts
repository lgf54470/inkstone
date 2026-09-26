import { normalizeTrackText } from './dedupe'

// Any track-shaped value the matcher sees: a search hit or a library row.
export interface MatchCandidate {
  title: string
  artist?: string | null
  durationMs?: number | null
}

// A recording at least this many times longer than the target (or the other
// way around) is a different thing wearing the same name — a live set or an
// audiobook — not a usable alternate source for it.
const DURATION_RATIO_MAX = 3

// FEA-A1-4: scores an online hit against the failed track. Title agreement is
// the gate (exact after normalization beats containment), artist agreement
// adds a point and a clash rejects, a wildly different duration rejects.
// 0 = no match; 10/11/20/21 otherwise, so exact titles always outrank partial
// ones regardless of artist. Cross-language title variants (translated or
// simplified/traditional pairs) intentionally do not match — a recorded
// limitation of the plain-text normalizer, not a bug in the ranking.
export function matchScore(hit: MatchCandidate, track: MatchCandidate): number {
  if (!normalizeTrackText(hit.title) || !normalizeTrackText(track.title)) return 0
  if (conflictingDuration(hit.durationMs, track.durationMs)) return 0
  const normalizedHit = normalizeTrackText(hit.title)
  const normalizedTrack = normalizeTrackText(track.title)
  const titleScore = normalizedHit === normalizedTrack
    ? 2
    : normalizedHit.includes(normalizedTrack) || normalizedTrack.includes(normalizedHit)
      ? 1
      : 0
  if (!titleScore) return 0
  const artistScore = artistAgreement(hit.artist, track.artist)
  if (artistScore < 0) return 0
  return titleScore * 10 + artistScore
}

// -1 = both sides name an artist and they disagree; 0 = at least one unknown,
// which stays neutral; 1 = same artist modulo containment.
function artistAgreement(hit: string | null | undefined, track: string | null | undefined): number {
  const hitName = normalizeTrackText(hit ?? '')
  const trackName = normalizeTrackText(track ?? '')
  if (!hitName || !trackName) return 0
  if (hitName === trackName || hitName.includes(trackName) || trackName.includes(hitName)) return 1
  return -1
}

function conflictingDuration(hitMs: number | null | undefined, trackMs: number | null | undefined): boolean {
  const hit = hitMs ?? 0
  const track = trackMs ?? 0
  if (hit <= 0 || track <= 0) return false
  return Math.max(hit, track) / Math.min(hit, track) > DURATION_RATIO_MAX
}
