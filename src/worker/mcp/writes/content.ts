import { interpolateNewNoteTemplate } from "@shared/markdown-utils";
import { ApiError } from "../../lib/errors";
import { buildOutline } from "../retrieval";

/** Final content for an MCP-created note: explicit content wins, blank notes follow the interpolated template. */
export function buildMcpNoteContent(inputContent: string | undefined, title: string, template: string): string {
  return inputContent
    ? inputContent
    : interpolateNewNoteTemplate(template, title)
}

export type NoteEditOperation = 'replace' | 'replace_section' | 'append' | 'prepend' | 'replace_all'

export function applyEdit(
  content: string,
  input: { operation: NoteEditOperation; text: string; oldText?: string; section?: string },
): string {
  if (input.operation === 'replace_all') return input.text
  if (input.operation === 'append') {
    if (!content) return input.text
    return `${content.replace(/\s*$/, '')}\n\n${input.text}`
  }
  if (input.operation === 'prepend') {
    if (!content) return input.text
    return `${input.text}\n\n${content.replace(/^\s*/, '')}`
  }
  if (input.operation === 'replace') {
    const oldText = input.oldText ?? ''
    if (!oldText) throw ApiError.badRequest('old_text is required for replace')
    const first = content.indexOf(oldText)
    if (first < 0) throw ApiError.conflict('old_text was not found; read the current note and retry')
    if (content.indexOf(oldText, first + oldText.length) >= 0) {
      throw ApiError.conflict('old_text occurs more than once; provide a larger unique passage')
    }
    return `${content.slice(0, first)}${input.text}${content.slice(first + oldText.length)}`
  }

  const section = input.section?.trim().toLowerCase()
  if (!section) throw ApiError.badRequest('section is required for replace_section')
  const outline = buildOutline(content)
  const index = outline.findIndex((item) => item.slug === section || item.title.toLowerCase() === section)
  if (index < 0) throw ApiError.notFound(`Section not found: ${input.section}`)
  const heading = outline[index]!
  const offsets = lineOffsets(content)
  const headingEnd = offsets[heading.line] ?? content.length
  const next = outline.slice(index + 1).find((item) => item.level <= heading.level)
  const sectionEnd = next ? (offsets[next.line - 1] ?? content.length) : content.length
  const replacement = input.text.trim()
  const middle = replacement ? `${replacement}\n\n` : ''
  return `${content.slice(0, headingEnd)}${middle}${content.slice(sectionEnd)}`
}

function lineOffsets(content: string): number[] {
  const offsets = [0]
  for (let index = 0; index < content.length; index++) {
    if (content[index] === '\n') offsets.push(index + 1)
  }
  return offsets
}
