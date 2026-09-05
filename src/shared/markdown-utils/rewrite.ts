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

export function replaceWikiLinkTarget(content: string, from: string, to: string): string {
  const frontMatter = parseFrontMatter(content)
  const lines = content.split('\n')
  let isInFence = false
  let fenceChar = ''
  let fenceLength = 0
  for (let index = frontMatter.lineOffset; index < lines.length; index++) {
    const line = lines[index]!
    const fence = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      const marker = fence[1]!
      if (!isInFence) {
        isInFence = true
        fenceChar = marker[0]!
        fenceLength = marker.length
      } else if (marker[0] === fenceChar && marker.length >= fenceLength) {
        isInFence = false
      }
      continue
    }
    if (isInFence) continue
    const safe = line.replace(/`+[^`\n]*`+/g, (value) => ' '.repeat(value.length))
    if (safe === line) {
      lines[index] = replaceWikiLinkTargetLine(line, from, to)
      continue
    }
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
    lines[index] = next
  }
  return lines.join('\n')
}
