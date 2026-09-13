const LEADING_FRONT_MATTER = /^---[ \t]*\r?\n[\s\S]*?\r?\n---/
const SLIDE_BREAK = /^ {0,3}-{3,}[ \t]*$/
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/

interface FenceMarker {
  char: string
  length: number
}

function isClosingFence(match: RegExpExecArray | null, marker: FenceMarker): boolean {
  const mark = match?.[1]
  if (!mark || mark[0] !== marker.char || mark.length < marker.length) return false
  return match![2]!.trim() === ''
}

function trimBlankEdges(slide: string): string {
  return slide.replace(/^(?:[ \t]*\r?\n)+/, '').replace(/(?:\r?\n[ \t]*)+$/, '')
}

export function splitIntoSlides(source: string): string[] {
  // A `---` with a non-blank line directly above is a setext heading rather than a
  // rule, so it must not split the deck; requiring a blank line (or deck start) keeps
  // slide boundaries identical to how the preview renders horizontal rules.
  const body = source.replace(LEADING_FRONT_MATTER, '')
  const slides: string[] = []
  let current: string[] = []
  let fence: FenceMarker | null = null
  const flush = () => {
    slides.push(trimBlankEdges(current.join('\n')))
    current = []
  }
  for (const line of body.split(/\r?\n/)) {
    const match = FENCE.exec(line)
    if (fence) {
      if (isClosingFence(match, fence)) fence = null
      current.push(line)
      continue
    }
    if (match) {
      fence = { char: match[1]![0]!, length: match[1]!.length }
      current.push(line)
      continue
    }
    if (SLIDE_BREAK.test(line) && (current.length === 0 || current[current.length - 1]!.trim() === '')) {
      flush()
      continue
    }
    current.push(line)
  }
  flush()
  // Edge separators (e.g. an unclosed front matter opener) would otherwise yield
  // blank first/last slides; blank slides between two breaks stay as written.
  while (slides.length > 1 && slides[0] === '') slides.shift()
  while (slides.length > 1 && slides[slides.length - 1] === '') slides.pop()
  return slides
}
