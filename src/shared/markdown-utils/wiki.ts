import { stripCodeRegions } from './code'
import { splitFrontMatter } from './front-matter'

export const WIKI_RE = /\[\[([^[\]|\n]{1,400})(?:\|([^[\]\n]{0,200}))?\]\]/g

export interface WikiLink {
  target: string
  alias: string | null
  key: string
}

export function extractWikiLinks(content: string): WikiLink[] {
  const safe = stripCodeRegions(splitFrontMatter(content).body)
  const seen = new Set<string>()
  const out: WikiLink[] = []
  for (const m of safe.matchAll(WIKI_RE)) {
    const target = m[1]!.trim()
    if (!target) continue
    const noteTarget = wikiNoteTarget(target)
    if (!noteTarget) continue
    const key = normalizeLinkKey(noteTarget)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ target, alias: m[2]?.trim() || null, key })
    if (out.length >= 200) break
  }
  return out
}

const ATTACHMENT_REFERENCE_RE =
  /(?:^|[\s(<"'=])\/api\/files\/([0-9a-hjkmnp-tv-z]{26})(?=$|[\s>)\]"'?#])/g

const MD_EXAMPLE_FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/
const MD_EXAMPLE_INFO_RE = /^\s*(?:md-example|markdown-example)\b/

export function extractAttachmentIds(content: string): string[] {
  const body = splitFrontMatter(content).body
  const ids = new Set<string>()
  for (const match of stripCodeRegions(body).matchAll(ATTACHMENT_REFERENCE_RE)) ids.add(match[1]!)
  // md-example fences are rendered as live Markdown by the client renderer, so
  // a reference inside one is real even though stripCodeRegions drops the fence.
  for (const inner of markdownExampleBodies(body)) {
    for (const id of extractAttachmentIds(inner)) ids.add(id)
  }
  return [...ids]
}

function markdownExampleBodies(text: string): string[] {
  const bodies: string[] = []
  let fenceChar = ''
  let fenceLen = 0
  let collecting: string[] | null = null
  for (const line of text.split('\n')) {
    const fence = MD_EXAMPLE_FENCE_RE.exec(line)
    if (!fence) {
      if (collecting !== null) collecting.push(line)
      continue
    }
    if (collecting === null) {
      if (!MD_EXAMPLE_INFO_RE.test(fence[2] ?? '')) continue
      fenceChar = fence[1]![0]!
      fenceLen = fence[1]!.length
      collecting = []
      continue
    }
    const marker = fence[1]!
    const closes = closesExampleFence({ marker, info: fence[2] ?? '', fenceChar, fenceLen })
    if (!closes) {
      // Inner fences stay in the body so the recursive call reads them again:
      // an ordinary one is stripped, a nested example is rendered as markdown.
      collecting.push(line)
      continue
    }
    bodies.push(collecting.join('\n'))
    collecting = null
  }
  if (collecting) bodies.push(collecting.join('\n'))
  return bodies
}

function closesExampleFence(fence: { marker: string, info: string, fenceChar: string, fenceLen: number }): boolean {
  // CommonMark: a marker followed by anything but whitespace opens a fence
  // instead of closing one, so it cannot end the example.
  return fence.marker[0] === fence.fenceChar && fence.marker.length >= fence.fenceLen && !fence.info.trim()
}

export function normalizeLinkKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function wikiNoteTarget(target: string): string {
  const value = target.trim()
  if (!value || value.startsWith('#') || value.startsWith('^')) return ''
  const hash = value.indexOf('#')
  return (hash >= 0 ? value.slice(0, hash) : value).trim()
}
