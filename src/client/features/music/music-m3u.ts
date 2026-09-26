import type { MusicTrack } from '@shared/types'
import { downloadFileName } from './music-utils'

export interface M3uEntry {
  /** The `#EXTINF` title, when the file carried one. */
  title: string | null
  /** The path or URL line that follows the extended info. */
  target: string
}

// `#EXTM3U` and any other directive are skipped; an `#EXTINF` line belongs to the
// path line that follows it, which is the pairing the format defines.
export function parseM3u(text: string): M3uEntry[] {
  const entries: M3uEntry[] = []
  let pendingTitle: string | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#')) {
      pendingTitle = extInfTitle(line) ?? pendingTitle
      continue
    }
    entries.push({ title: pendingTitle, target: line })
    pendingTitle = null
  }
  return entries
}

function extInfTitle(line: string): string | null {
  if (!line.toUpperCase().startsWith('#EXTINF:')) return null
  const comma = line.indexOf(',')
  if (comma < 0) return null
  return line.slice(comma + 1).trim() || null
}

/**
 * Export writes the download name plus an `artist - title` entry, and files from
 * elsewhere usually carry just a path, so a candidate is looked up under every
 * spelling the entry offers.
 */
export function matchM3uTracks(entries: readonly M3uEntry[], tracks: readonly MusicTrack[]): MusicTrack[] {
  const byKey = new Map<string, MusicTrack>()
  for (const track of tracks) {
    for (const key of trackKeys(track)) if (!byKey.has(key)) byKey.set(key, track)
  }
  const matched: MusicTrack[] = []
  for (const entry of entries) {
    for (const key of entryKeys(entry)) {
      const track = byKey.get(key)
      if (!track) continue
      matched.push(track)
      break
    }
  }
  return matched
}

function trackKeys(track: MusicTrack): string[] {
  return uniqueKeys([
    withoutExtension(downloadFileName(track)),
    [track.artist, track.title].filter(Boolean).join(' - '),
    track.title,
  ])
}

function entryKeys(entry: M3uEntry): string[] {
  const basename = entry.target.split(/[\\/]/).pop() ?? entry.target
  return uniqueKeys([withoutExtension(basename), entry.title])
}

function uniqueKeys(values: readonly (string | null | undefined)[]): string[] {
  const keys = new Set<string>()
  for (const value of values) {
    if (!value) continue
    const key = normalizeKey(value)
    if (key) keys.add(key)
  }
  return [...keys]
}

function withoutExtension(value: string): string {
  return value.replace(/\.[A-Za-z0-9]{1,5}$/, '')
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}
