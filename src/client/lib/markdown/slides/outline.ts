import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_DARK_BG,
  DEFAULT_DARK_COLOR,
} from './colors'
import {
  BENTO_SLIDES_FORMAT,
  BENTO_SLIDES_VERSION,
  type BentoDoc,
  type Slide,
  type SlideElement,
  type SlideTransitionKind,
  type TextElement,
  type ImageElement,
  type CodeElement,
  type TableElement,
} from './types'

interface ParsedSlideMeta {
  bg?: string
  transition?: SlideTransitionKind
  notes?: string
}

function extractSlideMeta(rawText: string): { meta: ParsedSlideMeta; cleanText: string } {
  const meta: ParsedSlideMeta = {}
  const regex = /\[(bg|transition|notes):\s*([^\]]+)\]/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(rawText)) !== null) {
    const key = match[1]!.toLowerCase()
    const val = match[2]!.trim()
    if (key === 'bg') meta.bg = val
    else if (key === 'transition') {
      const t = val.toLowerCase()
      if (['none', 'fade', 'slide', 'zoom', 'morph'].includes(t)) {
        meta.transition = t as SlideTransitionKind
      }
    } else if (key === 'notes') {
      meta.notes = val
    }
  }

  const cleanText = rawText.replace(/\[(bg|transition|notes):\s*([^\]]+)\]/gi, '').trim()
  return { meta, cleanText }
}

function parseSlideElements(lines: string[], slideIndex: number): SlideElement[] {
  const elements: SlideElement[] = []
  let title = ''
  const bullets: string[] = []
  const paragraphs: string[] = []
  const tableLines: string[] = []
  let inCodeBlock = false
  let codeLang = ''
  const codeLines: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push({
          id: `code-${slideIndex}-${elements.length + 1}`,
          type: 'code',
          code: codeLines.join('\n'),
          lang: codeLang || 'text',
          x: 96,
          y: title ? 220 : 120,
          w: 1088,
          h: 360,
          fontSize: 18,
        } as CodeElement)
        codeLines.length = 0
        inCodeBlock = false
      } else {
        inCodeBlock = true
        codeLang = line.slice(3).trim()
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(rawLine)
      continue
    }

    if (!line) continue

    const headingMatch = /^#{1,3}\s+(.+)$/.exec(line)
    if (headingMatch && !title) {
      title = headingMatch[1]!.trim()
      continue
    }

    const bulletMatch = /^[-*+]\s+(.+)$/.exec(line)
    if (bulletMatch) {
      bullets.push(bulletMatch[1]!.trim())
      continue
    }

    const imageMatch = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line)
    if (imageMatch) {
      elements.push({
        id: `img-${slideIndex}-${elements.length + 1}`,
        type: 'image',
        src: imageMatch[2]!.trim(),
        fit: 'contain',
        x: 680,
        y: title ? 180 : 120,
        w: 504,
        h: 420,
        radius: 8,
      } as ImageElement)
      continue
    }

    if (line.startsWith('|') && line.endsWith('|')) {
      tableLines.push(line)
      continue
    }

    paragraphs.push(line)
  }

  if (tableLines.length >= 2) {
    const headerRow = tableLines[0]!.split('|').map((s) => s.trim()).filter(Boolean)
    const dataRows = tableLines.slice(2).map((row) =>
      row.split('|').map((s) => s.trim()).filter(Boolean)
    )
    elements.push({
      id: `table-${slideIndex}-${elements.length + 1}`,
      type: 'table',
      columns: headerRow.map(() => ({})),
      rows: [
        { cells: headerRow.map((h) => ({ html: h, bold: true })) },
        ...dataRows.map((r) => ({ cells: r.map((c) => ({ html: c })) })),
      ],
      x: 96,
      y: title ? 190 : 120,
      w: 1088,
      h: 360,
    } as TableElement)
  }

  if (title) {
    elements.unshift({
      id: `title-${slideIndex}`,
      type: 'text',
      html: title,
      fontSize: 44,
      fontWeight: 700,
      align: 'left',
      valign: 'top',
      x: 96,
      y: 80,
      w: 1088,
      h: 80,
    } as TextElement)
  }

  const hasImage = elements.some((el) => el.type === 'image')
  const contentWidth = hasImage ? 540 : 1088

  if (bullets.length > 0) {
    const listHtml = `<ul class="slide-list">${bullets.map((b) => `<li>${b}</li>`).join('')}</ul>`
    elements.push({
      id: `bullets-${slideIndex}`,
      type: 'text',
      html: listHtml,
      fontSize: 24,
      fontWeight: 400,
      align: 'left',
      valign: 'top',
      lineHeight: 1.6,
      x: 96,
      y: title ? 190 : 120,
      w: contentWidth,
      h: 440,
    } as TextElement)
  } else if (paragraphs.length > 0) {
    const bodyHtml = paragraphs.map((p) => `<p>${p}</p>`).join('')
    elements.push({
      id: `body-${slideIndex}`,
      type: 'text',
      html: bodyHtml,
      fontSize: 22,
      fontWeight: 400,
      align: 'left',
      valign: 'top',
      lineHeight: 1.5,
      x: 96,
      y: title ? 190 : 120,
      w: contentWidth,
      h: 440,
    } as TextElement)
  }

  return elements
}

function splitIntoSlideBlocks(markdown: string): string[] {
  const trimmed = markdown.trim()
  if (!trimmed) return []

  if (trimmed.includes('\n---\n') || trimmed.startsWith('---\n')) {
    return trimmed
      .split(/(?:^|\n)---\r?\n/)
      .map((block) => block.trim())
      .filter(Boolean)
  }

  const lines = trimmed.split(/\r?\n/)
  const blocks: string[] = []
  let current: string[] = []

  for (const line of lines) {
    if (/^#\s+/.test(line) && current.length > 0) {
      blocks.push(current.join('\n').trim())
      current = [line]
    } else {
      current.push(line)
    }
  }

  if (current.length > 0) {
    blocks.push(current.join('\n').trim())
  }

  return blocks.filter(Boolean)
}

export function parseSlidesOutline(markdown: string): BentoDoc {
  const blocks = splitIntoSlideBlocks(markdown)
  const slides: Slide[] = []
  let deckTitle = 'Bento Presentation'

  blocks.forEach((block, index) => {
    const { meta, cleanText } = extractSlideMeta(block)
    const lines = cleanText.split(/\r?\n/)
    const firstHeading = lines.find((l) => /^#{1,3}\s+/.test(l.trim()))
    const title = firstHeading ? firstHeading.trim().replace(/^#{1,3}\s+/, '') : `Slide ${index + 1}`

    if (index === 0 && firstHeading) {
      deckTitle = title
    }

    const elements = parseSlideElements(lines, index + 1)

    slides.push({
      id: `slide-${index + 1}`,
      title,
      background: meta.bg,
      transition: meta.transition,
      notes: meta.notes,
      elements,
    })
  })

  if (slides.length === 0) {
    slides.push({
      id: 'slide-1',
      title: 'Untitled Slide',
      elements: [
        {
          id: 'title-1',
          type: 'text',
          html: 'Untitled Slide',
          fontSize: 44,
          fontWeight: 700,
          align: 'left',
          valign: 'top',
          x: 96,
          y: 80,
          w: 1088,
          h: 80,
        },
      ],
    })
  }

  return {
    format: BENTO_SLIDES_FORMAT,
    version: BENTO_SLIDES_VERSION,
    title: deckTitle,
    size: { width: 1280, height: 720 },
    theme: {
      background: DEFAULT_DARK_BG,
      color: DEFAULT_DARK_COLOR,
      accent: DEFAULT_ACCENT_COLOR,
    },
    slides,
  }
}

/**
 * The outline dialect is a readable projection of a deck, not a faithful one: it carries
 * titles, bullets, images, code and tables at the positions its own parser assigns, and
 * nothing else — no shapes, charts, hand-placed geometry, assets or theme. A body in this
 * mode therefore may only be written back while the document still round-trips through it;
 * the moment an edit leaves the dialect behind, write.ts writes JSON instead, because
 * losing the edit to keep the syntax is the one outcome nobody can see happening.
 */
export function outlineRoundTrips(data: BentoDoc): boolean {
  return canonical(data) === canonical(parseSlidesOutline(serializeSlidesOutline(data)))
}

/**
 * Key-order-insensitive comparison. The editor builds documents by spreading the ones it
 * has (which keeps the author's key order) while the parser builds its own, so comparing
 * the two as raw JSON text would report a loss that never happened and migrate a deck to
 * JSON for no reason. `undefined` is dropped for the same reason JSON.stringify drops it.
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined)
    entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function serializeSlidesOutline(data: BentoDoc): string {
  const slideBlocks: string[] = []

  for (const slide of data.slides) {
    const lines: string[] = []
    const title = slide.title || 'Slide'
    lines.push(`# ${title}`)

    const metaTags: string[] = []
    if (slide.background) metaTags.push(`[bg: ${slide.background}]`)
    if (slide.transition && slide.transition !== 'none') metaTags.push(`[transition: ${slide.transition}]`)
    if (slide.notes) metaTags.push(`[notes: ${slide.notes}]`)
    if (metaTags.length > 0) lines.push(metaTags.join(' '))

    for (const el of slide.elements) {
      if (el.type === 'text') {
        const textEl = el as TextElement
        if (textEl.html !== title) {
          const stripped = textEl.html
            .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_match, inner) => {
              return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
            })
            .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .trim()
          if (stripped) lines.push(stripped)
        }
      } else if (el.type === 'image') {
        const imgEl = el as ImageElement
        lines.push(`![](${imgEl.src})`)
      } else if (el.type === 'code') {
        const codeEl = el as CodeElement
        lines.push(`\`\`\`${codeEl.lang || ''}\n${codeEl.code}\n\`\`\``)
      } else if (el.type === 'table') {
        const tableEl = el as TableElement
        if (tableEl.rows.length > 0) {
          const header = tableEl.rows[0]?.cells.map((c) => c.html).join(' | ')
          lines.push(`| ${header} |`)
          lines.push(`| ${tableEl.rows[0]?.cells.map(() => '---').join(' | ')} |`)
          for (const row of tableEl.rows.slice(1)) {
            lines.push(`| ${row.cells.map((c) => c.html).join(' | ')} |`)
          }
        }
      }
    }

    slideBlocks.push(lines.join('\n').trim())
  }

  return slideBlocks.join('\n\n---\n\n')
}
