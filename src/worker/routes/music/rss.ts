import { LIMITS } from '@shared/constants'

// FEA-A2-2: a deliberately small RSS 2.0 reader. Podcast feeds are RSS 2.0 plus
// the itunes namespace in practice, so the parser reads the channel title and
// the enclosure-bearing items only — no full XML model, no Atom (recorded as a
// known limitation of the episode list). Everything is text-matched on purpose:
// the input is a bounded, user-subscribed feed, and an unreadable item is
// skipped rather than failing the whole feed.
export interface PodcastEpisode {
  title: string
  audioUrl: string
  sizeBytes: number
  durationSeconds: number
  publishedAt: number | null
  description: string
}

export interface ParsedPodcastFeed {
  title: string
  description: string
  episodes: PodcastEpisode[]
}

export function parsePodcastFeed(xml: string): ParsedPodcastFeed | null {
  const channel = /<channel[\s>][\s\S]*<\/channel>/i.exec(xml) ?? /<channel\s*\/>/i.exec(xml)
  if (!channel) return null
  const block = channel[0]
  const title = tagContent(block, 'title')
  if (!title) return null
  const episodes: PodcastEpisode[] = []
  for (const match of block.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const episode = parseEpisode(match[0])
    if (episode) episodes.push(episode)
    if (episodes.length >= LIMITS.musicPodcastEpisodeMax) break
  }
  return { title, description: tagContent(block, 'description') ?? '', episodes }
}

function parseEpisode(block: string): PodcastEpisode | null {
  const title = tagContent(block, 'title')
  const audioUrl = /<enclosure\b[^>]*\burl\s*=\s*["']([^"']+)["']/i.exec(block)?.[1]
  if (!title || !audioUrl) return null
  const length = Number(/<enclosure\b[^>]*\blength\s*=\s*["'](\d+)["']/i.exec(block)?.[1] ?? 0)
  const pubDate = tagContent(block, 'pubDate')
  const parsedDate = pubDate ? Date.parse(pubDate) : Number.NaN
  return {
    title,
    audioUrl,
    sizeBytes: Number.isFinite(length) ? length : 0,
    durationSeconds: parseDuration(tagContent(block, 'itunes:duration')),
    publishedAt: Number.isFinite(parsedDate) ? parsedDate : null,
    description: tagContent(block, 'description') ?? '',
  }
}

// itunes:duration arrives either as seconds ("941") or as "1:02:03"; anything
// unreadable is just a zero, so the row still renders without a duration.
function parseDuration(value: string | null): number {
  if (!value) return 0
  if (/^\d+$/.test(value.trim())) return Number(value.trim())
  const parts = value.trim().split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return 0
  return parts.reduce((total, part) => total * 60 + part, 0)
}

function tagContent(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(block)
  if (!match) return null
  return decodeXmlEntities(stripCdata(match[1]!)).trim()
}

function stripCdata(value: string): string {
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/i.exec(value.trim())
  return cdata ? cdata[1]! : value
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)
}
