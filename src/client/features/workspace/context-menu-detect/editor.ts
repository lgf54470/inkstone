import { type EditorView } from '@codemirror/view'
import { parseMarkdownTable } from '../../../lib/markdown/table-editor'
import { parseFenceInfo } from '../../../lib/markdown/renderer'
import { type Text } from '@codemirror/state'

import type { EditorContextData } from './types'

export function detectEditorContext(view: EditorView, pos: number): EditorContextData {
  const doc = view.state.doc
  const clampedPos = Math.max(0, Math.min(pos, doc.length))
  const line = doc.lineAt(clampedPos)
  const lineNumber = line.number
  const lineText = line.text
  const offsetInLine = clampedPos - line.from

  return detectSelection(view, clampedPos, lineNumber)
    ?? detectFrontMatter(doc, clampedPos, lineNumber)
    ?? detectFencedBlock(doc, clampedPos, lineNumber)
    ?? detectTable(doc, lineText, lineNumber, offsetInLine, clampedPos)
    ?? detectLinePatterns(line, lineText, offsetInLine, clampedPos, lineNumber)
    ?? detectHeading(lineText, line, clampedPos, lineNumber)
    ?? { type: 'empty', pos: clampedPos, lineNumber }
}

function detectSelection(view: EditorView, pos: number, lineNumber: number): EditorContextData | null {
  const selection = view.state.selection.main
  if (selection.empty || pos < selection.from || pos > selection.to) return null
  const selectedText = view.state.sliceDoc(selection.from, selection.to)
  return {
    type: 'selection',
    pos,
    lineNumber,
    selectedText,
  }
}

function detectFrontMatter(doc: Text, pos: number, lineNumber: number): EditorContextData | null {
  const frontMatterMatch = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(doc.toString())
  if (!frontMatterMatch || pos > frontMatterMatch[0].length) return null
  return {
    type: 'frontmatter',
    pos,
    lineNumber,
  }
}

function detectFencedBlock(doc: Text, pos: number, lineNumber: number): EditorContextData | null {
  const codeFence = findCodeFenceAround(doc, pos)
  if (codeFence) return codeFenceContext(pos, lineNumber, codeFence)
  const mathBlock = findMathBlockAround(doc, pos)
  if (mathBlock) return mathBlockContext(pos, lineNumber, mathBlock)
  return null
}

function detectTable(doc: Text, lineText: string, lineNumber: number, offsetInLine: number, pos: number): EditorContextData | null {
  if (!lineText.includes('|')) return null
  const lines = doc.toJSON()
  const table = parseMarkdownTable(lines, lineNumber - 1, offsetInLine)
  if (!table) return null
  return {
    type: 'table',
    pos,
    lineNumber,
    table,
  }
}

function detectHeading(
  lineText: string,
  line: { from: number; to: number },
  pos: number,
  lineNumber: number,
): EditorContextData | null {
  const match = /^(\s{0,3})(#{1,6})\s+(.*)$/.exec(lineText)
  if (!match) return null
  const rawText = match[3] ?? ''
  const text = rawText.replace(/\s+#+\s*$/, '').trim()
  return {
    type: 'heading',
    pos,
    lineNumber,
    heading: {
      level: match[2]!.length,
      text,
      from: line.from,
      to: line.to,
    },
  }
}

function detectLinePatterns(
  line: { from: number; to: number },
  lineText: string,
  offsetInLine: number,
  pos: number,
  lineNumber: number,
): EditorContextData | null {
  return inlineMatchContext({
    regex: /!\[([^\]]*)\]\(([^)]+)\)/g,
    lineText,
    offset: offsetInLine,
    lineFrom: line.from,
    pos,
    lineNumber,
    build: (m, from, to) => ({ type: 'image', image: { alt: m[1] ?? '', url: m[2] ?? '', raw: m[0], from, to } }),
  })
    ?? inlineMatchContext({
      regex: /\[\[([^\]]+)\]\]/g,
      lineText,
      offset: offsetInLine,
      lineFrom: line.from,
      pos,
      lineNumber,
      build: (m, from, to) => {
        const parts = (m[1] ?? '').split('|')
        return { type: 'wikilink', wikiLink: { target: parts[0] ? parts[0].trim() : '', alias: parts[1]?.trim(), from, to } }
      },
    })
    ?? inlineMatchContext({
      regex: /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g,
      lineText,
      offset: offsetInLine,
      lineFrom: line.from,
      pos,
      lineNumber,
      build: (m, from, to) => ({ type: 'link', link: { text: m[1] ?? '', url: m[2] ?? '', from, to } }),
    })
    ?? inlineMatchContext({
      regex: /\$([^\$\n]+)\$/g,
      lineText,
      offset: offsetInLine,
      lineFrom: line.from,
      pos,
      lineNumber,
      build: (m, from, to) => ({ type: 'math', math: { formula: m[1] ?? '', isBlock: false, from, to } }),
    })
    ?? detectTask(lineText, line, pos, lineNumber)
}

function inlineMatchContext(args: {
  regex: RegExp
  lineText: string
  offset: number
  lineFrom: number
  pos: number
  lineNumber: number
  build: (match: RegExpExecArray, from: number, to: number) => Omit<EditorContextData, 'pos' | 'lineNumber'>
}): EditorContextData | null {
  const match = findMatchAt(args.regex, args.lineText, args.offset)
  if (!match) return null
  const matchStart = match.index
  const matchEnd = matchStart + match[0].length
  const built = args.build(match, args.lineFrom + matchStart, args.lineFrom + matchEnd)
  return { ...built, pos: args.pos, lineNumber: args.lineNumber }
}

function detectTask(lineText: string, line: { from: number; to: number }, pos: number, lineNumber: number): EditorContextData | null {
  const taskMatch = /^(\s*[-*+]\s+\[([ xX])\]\s+)(.*)$/.exec(lineText)
  if (!taskMatch) return null
  return {
    type: 'task',
    pos,
    lineNumber,
    task: {
      checked: taskMatch[2]?.toLowerCase() === 'x',
      text: taskMatch[3] ?? '',
      from: line.from,
      to: line.to,
    },
  }
}

function findMatchAt(regex: RegExp, lineText: string, offset: number): RegExpExecArray | null {
  let match: RegExpExecArray | null
  while ((match = regex.exec(lineText)) !== null) {
    if (offset >= match.index && offset <= match.index + match[0].length) return match
  }
  return null
}

type LiveFenceKind = 'mermaid' | 'mindmap' | 'excalidraw' | 'chart' | 'kanban' | 'slides'

/** The fences whose own menu replaces the code block's, by every name the language goes by. */
const LIVE_FENCE_KINDS: Record<string, LiveFenceKind> = {
  mermaid: 'mermaid',
  mindmap: 'mindmap',
  'mind-elixir': 'mindmap',
  excalidraw: 'excalidraw',
  chart: 'chart',
  chartjs: 'chart',
  kanban: 'kanban',
  'notion-kanban': 'kanban',
  board: 'kanban',
  'bento-slides': 'slides',
  'bento-slide': 'slides',
  slides: 'slides',
  ppt: 'slides',
  bento: 'slides',
}

function codeFenceContext(
  pos: number,
  lineNumber: number,
  codeFence: { language: string; code: string; from: number; to: number; isClosed?: boolean },
): EditorContextData {
  const live = liveFenceContext(pos, lineNumber, codeFence)
  if (live) return live
  return {
    type: 'codeblock',
    pos,
    lineNumber,
    codeBlock: {
      language: codeFence.language,
      code: codeFence.code,
      from: codeFence.from,
      to: codeFence.to,
      isClosed: codeFence.isClosed,
    },
  }
}

/** The context a diagram fence carries: its source and the range a template would replace. */
function liveFenceContext(
  pos: number,
  lineNumber: number,
  codeFence: { language: string; code: string; from: number; to: number },
): EditorContextData | null {
  const kind = LIVE_FENCE_KINDS[codeFence.language.toLowerCase()]
  const source = { code: codeFence.code, from: codeFence.from, to: codeFence.to }
  if (kind === 'mermaid') return { type: 'mermaid', pos, lineNumber, mermaid: source }
  if (kind === 'mindmap') return { type: 'mindmap', pos, lineNumber, mindmap: source }
  if (kind === 'excalidraw') return { type: 'excalidraw', pos, lineNumber, excalidraw: source }
  if (kind === 'chart') return { type: 'chart', pos, lineNumber, chart: source }
  if (kind === 'kanban') return { type: 'kanban', pos, lineNumber, kanban: source }
  if (kind === 'slides') return { type: 'slides', pos, lineNumber, slides: source }
  return null
}

function mathBlockContext(
  pos: number,
  lineNumber: number,
  mathBlock: { formula: string; from: number; to: number },
): EditorContextData {
  return {
    type: 'math',
    pos,
    lineNumber,
    math: {
      formula: mathBlock.formula,
      isBlock: true,
      from: mathBlock.from,
      to: mathBlock.to,
    },
  }
}


export interface FenceBlock {
  openLine: number
  closeLine: number
  language: string
  code: string
  isClosed: boolean
}

interface OpenFence {
  index: number
  char: string
  count: number
  language: string
}

const MARKDOWN_CONTAINER_LANGS = new Set(['md-example', 'markdown-example', 'markdown', 'md', 'mdx'])

export function isMarkdownContainer(lang: string): boolean {
  const base = lang.trim().toLowerCase().split(/[\s:{[(\]]/)[0] ?? ''
  return MARKDOWN_CONTAINER_LANGS.has(base)
}

function matchClosingFence(stack: OpenFence[], closeChar: string, closeCount: number): number {
  for (let s = stack.length - 1; s >= 0; s--) {
    const openFence = stack[s]!
    if (openFence.char === closeChar && closeCount >= openFence.count) {
      return s
    }
    if (!isMarkdownContainer(openFence.language)) {
      break
    }
  }
  return -1
}

function closeFenceBlocks(stack: OpenFence[], blocks: FenceBlock[], matchIndex: number, closeLine: number, lines: string[]): void {
  while (stack.length > matchIndex + 1) {
    const unclosed = stack.pop()!
    blocks.push({
      openLine: unclosed.index,
      closeLine: closeLine - 1,
      language: unclosed.language,
      code: lines.slice(unclosed.index + 1, closeLine).join('\n'),
      isClosed: false,
    })
  }
  const closed = stack.pop()!
  blocks.push({
    openLine: closed.index,
    closeLine,
    language: closed.language,
    code: lines.slice(closed.index + 1, closeLine).join('\n'),
    isClosed: true,
  })
}

function canOpenFence(stack: OpenFence[], openChar: string, openCount: number): boolean {
  if (stack.length === 0) return true
  const top = stack[stack.length - 1]!
  if (!isMarkdownContainer(top.language)) return false
  return openChar !== top.char || openCount < top.count
}

function selectInnermostBlock(blocks: FenceBlock[], targetLine: number): FenceBlock | null {
  const enclosing = blocks.filter((b) => targetLine >= b.openLine && targetLine <= b.closeLine)
  if (enclosing.length === 0) return null

  enclosing.sort((a, b) => {
    const spanA = a.closeLine - a.openLine
    const spanB = b.closeLine - b.openLine
    return spanA !== spanB ? spanA - spanB : b.openLine - a.openLine
  })

  return enclosing[0]!
}

export function findCodeFenceInLines(lines: string[], targetLine: number): FenceBlock | null {
  if (targetLine < 0 || targetLine >= lines.length) return null

  const stack: OpenFence[] = []
  const blocks: FenceBlock[] = []

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]!
    const closeMatch = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/.exec(text)

    if (closeMatch && stack.length > 0) {
      const matchIndex = matchClosingFence(stack, closeMatch[1]![0]!, closeMatch[1]!.length)
      if (matchIndex !== -1) {
        closeFenceBlocks(stack, blocks, matchIndex, i, lines)
        continue
      }
    }

    const openMatch = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/.exec(text)
    if (openMatch) {
      const openChar = openMatch[1]![0]!
      const rawInfo = openMatch[2] ?? ''
      if (openChar === '`' && rawInfo.includes('`')) continue

      if (canOpenFence(stack, openChar, openMatch[1]!.length)) {
        const info = parseFenceInfo(rawInfo)
        const lang = (info.language || '').split(':')[0]!.trim()
        stack.push({ index: i, char: openChar, count: openMatch[1]!.length, language: lang })
      }
    }
  }

  while (stack.length > 0) {
    const unclosed = stack.pop()!
    blocks.push({
      openLine: unclosed.index,
      closeLine: lines.length - 1,
      language: unclosed.language,
      code: lines.slice(unclosed.index + 1).join('\n'),
      isClosed: false,
    })
  }

  return selectInnermostBlock(blocks, targetLine)
}

function findCodeFenceAround(
  doc: Text,
  pos: number,
): { language: string; code: string; from: number; to: number; isClosed?: boolean } | null {
  const lines = doc.toJSON()
  const targetLineNumber = doc.lineAt(pos).number
  const block = findCodeFenceInLines(lines, targetLineNumber - 1)
  if (!block) return null

  const from = doc.line(block.openLine + 1).from
  const to = doc.line(block.closeLine + 1).to

  return {
    language: block.language,
    code: block.code,
    from,
    to,
    isClosed: block.isClosed,
  }
}


function findMathBlockAround(doc: Text, pos: number): { formula: string; from: number; to: number } | null {
  const targetLineNumber = doc.lineAt(pos).number
  let openLine = -1

  for (let i = 1; i <= doc.lines; i++) {
    const text = doc.line(i).text
    if (openLine === -1) {
      if (i > targetLineNumber) {
        return null
      }
      if (/^\s*\$\$\s*$/.test(text)) {
        openLine = i
      } else if (i === targetLineNumber) {
        return null
      }
    } else {
      if (/^\s*\$\$\s*$/.test(text)) {
        const closeLine = i
        if (targetLineNumber >= openLine && targetLineNumber <= closeLine) {
          const from = doc.line(openLine).from
          const to = doc.line(closeLine).to
          const mathLines: string[] = []
          for (let j = openLine + 1; j < closeLine; j++) {
            mathLines.push(doc.line(j).text)
          }
          return {
            formula: mathLines.join('\n'),
            from,
            to,
          }
        }
        openLine = -1
        if (i >= targetLineNumber) {
          return null
        }
      }
    }
  }

  if (openLine !== -1 && targetLineNumber >= openLine) {
    const from = doc.line(openLine).from
    const to = doc.length
    const mathLines: string[] = []
    for (let j = openLine + 1; j <= doc.lines; j++) {
      mathLines.push(doc.line(j).text)
    }
    return {
      formula: mathLines.join('\n'),
      from,
      to,
    }
  }

  return null
}