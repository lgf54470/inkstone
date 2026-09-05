import { parseFrontMatter } from './front-matter';
import { WIKI_RE, normalizeLinkKey, wikiNoteTarget } from './wiki';

function replaceWikiLinkTargetLine(content: string, from: string, to: string): string {
  const fromKey = normalizeLinkKey(from)
  return content.replace(
    /\[\[([^[\]|\n]{1,400})(\|[^[\]\n]{0,200})?\]\]/g,
    (whole, target: string, alias?: string) => {
      const note = wikiNoteTarget(target)
      if (normalizeLinkKey(note) !== fromKey) return whole
      const fragment = target.slice(note.length)
      return `[[${to}${fragment}${alias ?? ''}]]`
    },
  )
}

interface FenceState {
  isInFence: boolean
  fenceChar: string
  fenceLength: number
}

const FENCE_START: FenceState = { isInFence: false, fenceChar: '', fenceLength: 0 }

const FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})/

function advanceFence(line: string, state: FenceState): FenceState | null {
  const fence = FENCE_RE.exec(line)
  if (!fence) return null
  const marker = fence[1]!
  if (!state.isInFence) {
    return { isInFence: true, fenceChar: marker[0]!, fenceLength: marker.length }
  }
  if (marker[0] === state.fenceChar && marker.length >= state.fenceLength) {
    return { ...FENCE_START }
  }
  return state
}

function replaceInlineWikiLinks(line: string, from: string, to: string): string {
  const safe = line.replace(/`+[^`\n]*`+/g, (value) => ' '.repeat(value.length))
  if (safe === line) return replaceWikiLinkTargetLine(line, from, to)
  const replacements: Array<{ start: number; end: number; value: string }> = []
  for (const match of safe.matchAll(WIKI_RE)) {
    const original = line.slice(match.index!, match.index! + match[0].length)
    const value = replaceWikiLinkTargetLine(original, from, to)
    if (value !== original) replacements.push({ start: match.index!, end: match.index! + match[0].length, value })
  }
  let next = line
  for (const replacement of replacements.reverse()) {
    next = next.slice(0, replacement.start) + replacement.value + next.slice(replacement.end)
  }
  return next
}

export function replaceWikiLinkTarget(content: string, from: string, to: string): string {
  const frontMatter = parseFrontMatter(content)
  const lines = content.split('\n')
  let state = FENCE_START
  for (let index = frontMatter.lineOffset; index < lines.length; index++) {
    const line = lines[index]!
    const next = advanceFence(line, state)
    if (next) {
      state = next
      continue
    }
    if (state.isInFence) continue
    lines[index] = replaceInlineWikiLinks(line, from, to)
  }
  return lines.join('\n')
}
