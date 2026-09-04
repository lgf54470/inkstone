import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import anchor from 'markdown-it-anchor'
import mark from 'markdown-it-mark'
import sub from 'markdown-it-sub'
import sup from 'markdown-it-sup'
import ins from 'markdown-it-ins'
import { full as emoji } from 'markdown-it-emoji'
import deflist from 'markdown-it-deflist'
import abbr from 'markdown-it-abbr'
import ruby from 'markdown-it-ruby'
import katex from 'katex'
import { highlightCode } from './prism.ts'

export interface TocHeading {
  level: number
  text: string
  slug: string
}

export interface RenderResult {
  html: string
  headings: TocHeading[]
}

export interface FenceInfo {
  language: string
  title: string
  lineNumbers: boolean
  startLine: number
  highlightedLines: number[]
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function escapeAttr(str: string): string {
  return escapeHtml(str)
}

export function stripObsidianComments(source: string): string {
  const lines = source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(Boolean) ?? []
  let inComment = false
  let fenceChar = ''
  let fenceLength = 0
  return lines
    .map((line) => {
      const ending = /\r\n$|[\r\n]$/.exec(line)?.[0] ?? ''
      const body = ending ? line.slice(0, -ending.length) : line
      const fence = !inComment ? /^ {0,3}(`{3,}|~{3,})/.exec(body) : null
      if (fence) {
        const marker = fence[1]!
        if (!fenceChar) {
          fenceChar = marker[0]!
          fenceLength = marker.length
        } else if (marker[0] === fenceChar && marker.length >= fenceLength) {
          fenceChar = ''
          fenceLength = 0
        }
        return line
      }
      if (fenceChar) return line
      let output = ''
      let inlineTicks = 0
      for (let index = 0; index < body.length; ) {
        if (body[index] === '`' && !inComment) {
          let end = index + 1
          while (body[end] === '`') end++
          const ticks = end - index
          if (!inlineTicks || inlineTicks === ticks) inlineTicks = inlineTicks ? 0 : ticks
          output += body.slice(index, end)
          index = end
          continue
        }
        const marker = body.startsWith('%%', index) && body[index - 1] !== '\\'
        if (marker && !inlineTicks) {
          inComment = !inComment
          output += '  '
          index += 2
          continue
        }
        output += inComment ? ' ' : body[index]!
        index++
      }
      return output + ending
    })
    .join('')
}

export function parseFenceInfo(source: string): FenceInfo {
  let rest = source.trim()
  let language = ''
  let title = ''
  let lineNumbers = false
  let startLine = 1
  const highlighted = new Set<number>()

  const leadingCodeOptions = /^\{([^\{}]+)\}/.exec(rest)
  if (leadingCodeOptions && !/^\d[\d,\s-]*$/.test(leadingCodeOptions[1]!.trim())) {
    const classes = [...leadingCodeOptions[1]!.matchAll(/(?:^|\s)\.([A-Za-z][\w-]{0,63})/g)].map((m) => m[1]!)
    language = classes.find((c) => !['line-numbers', 'linenos', 'numberLines'].includes(c))?.toLowerCase() ?? ''
    lineNumbers = classes.some((c) => ['line-numbers', 'linenos', 'numberLines'].includes(c))
    const titleMatch = /title=(?:"([^"]*)"|'([^']*)'|([^\s}]+))/.exec(leadingCodeOptions[1]!)
    if (titleMatch) title = titleMatch[1] ?? titleMatch[2] ?? titleMatch[3] ?? ''
    rest = rest.slice(leadingCodeOptions[0].length).trim()
  }

  if (!language) {
    const langMatch = /^([^\s{]+)/.exec(rest)
    if (langMatch) {
      language = langMatch[1]!.toLowerCase()
      rest = rest.slice(langMatch[0].length).trim()
    }
  }

  const titleMatch = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)'|([^\s]+))/.exec(rest)
  if (titleMatch) title = titleMatch[1] ?? titleMatch[2] ?? titleMatch[3] ?? ''
  const bracketTitle = /(?:^|\s)\[([^\]\n]+)\]/.exec(rest)
  if (!title && bracketTitle) title = bracketTitle[1]!.trim()

  lineNumbers = lineNumbers || /(?:^|\s)(?:line-numbers|linenos|numberLines)(?=\s|$)/.test(rest)
  const start = /(?:^|\s)(?:start|startFrom)=(?:"(\d+)"|'(\d+)'|(\d+))/.exec(rest)
  if (start) startLine = Math.max(1, Number(start[1] ?? start[2] ?? start[3]))

  const hlMatch = /(?:^|\s)\{(\d[\d,\s-]*)\}/.exec(rest)
  if (hlMatch) {
    parseLineNumbers(hlMatch[1]!).forEach((n) => highlighted.add(n))
  }

  return {
    language,
    title,
    lineNumbers,
    startLine,
    highlightedLines: [...highlighted].sort((a, b) => a - b),
  }
}

function parseLineNumbers(spec: string): number[] {
  const result: number[] = []
  const parts = spec.split(',')
  for (const part of parts) {
    const trimmed = part.trim()
    if (/^\d+$/.test(trimmed)) {
      result.push(Number(trimmed))
    } else if (/^(\d+)\s*-\s*(\d+)$/.test(trimmed)) {
      const match = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed)!
      const start = Number(match[1])
      const end = Number(match[2])
      for (let i = start; i <= end; i++) result.push(i)
    }
  }
  return result
}

function splitHtmlIntoLines(html: string, startLine: number, highlightedLines: number[]): string {
  const lines = html.split(/\r?\n/)
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  const highlightSet = new Set(highlightedLines)
  const openTags: string[] = []

  return lines
    .map((rawLine, idx) => {
      const lineNum = startLine + idx
      const isHl = highlightSet.has(idx + 1)
      let lineContent = openTags.join('') + rawLine
      const tagRegex = /<\/?([a-zA-Z0-9-]+)(?:\s+[^>]*?)?>/g
      let match: RegExpExecArray | null
      while ((match = tagRegex.exec(rawLine)) !== null) {
        const fullTag = match[0]
        if (fullTag.startsWith('</')) {
          openTags.pop()
        } else if (!fullTag.endsWith('/>')) {
          openTags.push(fullTag)
        }
      }
      for (let i = openTags.length - 1; i >= 0; i--) {
        const tagNameMatch = /^<([a-zA-Z0-9-]+)/.exec(openTags[i]!)
        if (tagNameMatch) lineContent += `</${tagNameMatch[1]}>`
      }
      const display = lineContent || ' '
      return `<span class="line${isHl ? ' highlighted' : ''}" data-line-number="${lineNum}">${display}</span>`
    })
    .join('\n')
}

function normalizeCalloutType(val: string): string {
  const type = val.toLowerCase()
  const aliases: Record<string, string> = {
    summary: 'abstract',
    tldr: 'abstract',
    hint: 'tip',
    important: 'important',
    check: 'success',
    done: 'success',
    help: 'question',
    faq: 'question',
    caution: 'caution',
    attention: 'warning',
    fail: 'failure',
    missing: 'failure',
    error: 'danger',
    bug: 'danger',
    cite: 'quote',
  }
  return (aliases[type] ?? type.replace(/[^a-z0-9_-]/g, '')) || 'note'
}

function calloutDefaultTitle(type: string): string {
  const map: Record<string, string> = {
    note: '核心提示 (Note)',
    abstract: '内容摘要 (Abstract)',
    info: '关键信息 (Info)',
    todo: '任务清单 (Todo)',
    tip: '实用技巧 (Tip)',
    success: '成功完成 (Success)',
    question: '疑问待定 (Question)',
    warning: '注意事项 (Warning)',
    failure: '执行失败 (Failure)',
    danger: '危险警示 (Danger)',
    caution: '风险预警 (Caution)',
    example: '演示示例 (Example)',
    quote: '引述内容 (Quote)',
    important: '重要规范 (Important)',
  }
  return map[type] ?? type.toUpperCase()
}

function blockLine(state: any, line: number): string {
  const pos = state.bMarks[line] + state.tShift[line]
  const max = state.eMarks[line]
  return state.src.slice(pos, max)
}

function findColonFenceEnd(state: any, start: number, end: number, markerLength: number): number {
  let fence: { char: string; length: number } | null = null
  for (let line = start; line < end; line++) {
    const text = blockLine(state, line)
    const codeFence = /^(`{3,}|~{3,})/.exec(text)
    if (codeFence) {
      const marker = codeFence[1]!
      if (!fence) fence = { char: marker[0]!, length: marker.length }
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = null
      continue
    }
    if (!fence && new RegExp(`^:{${markerLength},}\\s*$`).test(text)) return line
  }
  return -1
}

function findTabSegments(state: any, start: number, end: number) {
  const markers: Array<{ line: number; title: string; selected: boolean }> = []
  let fence: { char: string; length: number } | null = null
  for (let line = start; line < end; line++) {
    const text = blockLine(state, line)
    const fenceMatch = /^(`{3,}|~{3,})/.exec(text)
    if (fenceMatch) {
      const marker = fenceMatch[1]!
      if (!fence) fence = { char: marker[0]!, length: marker.length }
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = null
      continue
    }
    if (fence) continue
    const tab = /^@tab(?::active|\+)?\b[ \t]+(.+?)[ \t]*$/.exec(text)
    if (tab) {
      const selected = /^@tab(?::active|\+)\b/.test(text)
      markers.push({ line, title: tab[1]!.trim(), selected })
    }
  }
  return markers.map((marker, index) => ({
    title: marker.title,
    start: marker.line + 1,
    end: markers[index + 1]?.line ?? end,
    selected: marker.selected,
  }))
}

export function renderMarkdown(rawMarkdown: string): RenderResult {
  if (!rawMarkdown) {
    return { html: '', headings: [] }
  }

  // 1. Strip YAML frontmatter if present
  let content = rawMarkdown
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (fmMatch) {
    content = content.slice(fmMatch[0].length)
  }

  // 2. Strip Obsidian comments
  content = stripObsidianComments(content)

  const headings: TocHeading[] = []
  const usedSlugs = new Set<string>()

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: false,
    langPrefix: 'language-',
  })

  // Built-in standard plugins
  md.use(taskLists, { enabled: true, label: false })
    .use(footnote)
    .use(mark)
    .use(sub)
    .use(sup)
    .use(ins)
    .use(emoji, { shortcuts: {} })
    .use(deflist)
    .use(abbr)
    .use(ruby)

  // Math inline: $...$
  const MATH_INLINE = /^\$(?!\s)((?:[^$\\]|\\.)+?)(?<!\s)\$/
  md.inline.ruler.before('escape', 'math_inline', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x24 /* $ */) return false
    if (state.src.charCodeAt(state.pos + 1) === 0x24) return false
    const match = MATH_INLINE.exec(state.src.slice(state.pos))
    if (!match) return false
    if (!silent) {
      const token = state.push('math_inline', 'span', 0)
      token.content = match[1]!
    }
    state.pos += match[0].length
    return true
  })

  // Math block: $$...$$
  md.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
    const line = blockLine(state, startLine)
    if (!/^\$\$/.test(line)) return false
    const firstLine = line.slice(2)
    let mathContent = ''
    let next = startLine
    let found = false
    if (firstLine.trim().endsWith('$$')) {
      mathContent = firstLine.trim().slice(0, -2)
      found = true
    } else {
      while (!found && ++next < endLine) {
        const text = blockLine(state, next)
        if (text.trim().endsWith('$$')) {
          mathContent += text.slice(0, text.lastIndexOf('$$'))
          found = true
        } else {
          mathContent += `${text}\n`
        }
      }
      if (firstLine.trim()) mathContent = `${firstLine}\n${mathContent}`
    }
    if (!found) return false
    if (silent) return true
    const token = state.push('math_block', 'div', 0)
    token.content = mathContent.trim()
    token.map = [startLine, next + 1]
    token.markup = '$$'
    state.line = next + 1
    return true
  })

  // TOC block: [TOC] or [[TOC]]
  md.block.ruler.before('paragraph', 'toc', (state, startLine, _endLine, silent) => {
    const line = blockLine(state, startLine).trim()
    if (!/^\[(?:\[\s*(?:toc|TOC)\s*\]\]|(?:toc|TOC))\]$/.test(line)) return false
    if (silent) return true
    state.line = startLine + 1
    state.push('toc', 'nav', 0)
    return true
  })

  // Containers: ::: details and ::: tabs
  md.block.ruler.before('fence', 'modern_container', (state, startLine, endLine, silent) => {
    const source = blockLine(state, startLine)
    const match = /^(:{3,})[ \t]+(details|tabs)\b(?:[ \t]+(.*))?$/.exec(source)
    if (!match) return false
    const markerLength = match[1]!.length
    const kind = match[2]!
    const rawInfo = (match[3] ?? '').trim()
    const end = findColonFenceEnd(state, startLine + 1, endLine, markerLength)
    if (end < 0) return false
    if (silent) return true

    if (kind === 'details') {
      const open = /^(?:open|\+)\b/.test(rawInfo)
      const title = rawInfo.replace(/^(?:open|\+)\b[ \t]*/, '').replace(/^\[|\]$/g, '').trim() || '详细内容'
      const openToken = state.push('details_open', 'details', 1)
      openToken.block = true
      openToken.meta = { open, title }
      state.md.block.tokenize(state, startLine + 1, end)
      state.push('details_close', 'details', -1).block = true
    } else {
      const tabs = findTabSegments(state, startLine + 1, end)
      if (!tabs.length) {
        state.line = end + 1
        return true
      }
      const selectedIndex = Math.max(0, tabs.findIndex((t) => t.selected))
      const openToken = state.push('tabs_open', 'div', 1)
      openToken.block = true
      openToken.meta = { titles: tabs.map((t) => t.title), selectedIndex }
      tabs.forEach((tab, tabIndex) => {
        const panelOpen = state.push('tab_panel_open', 'section', 1)
        panelOpen.block = true
        panelOpen.meta = { tabIndex, selected: tabIndex === selectedIndex }
        state.md.block.tokenize(state, tab.start, tab.end)
        state.push('tab_panel_close', 'section', -1).block = true
      })
      state.push('tabs_close', 'div', -1).block = true
    }
    state.line = end + 1
    return true
  })

  // Inline ruby brackets: [汉字]{注音}
  md.inline.ruler.before('link', 'ruby_bracket', (state, silent) => {
    const start = state.pos
    if (state.src.charCodeAt(start) !== 0x5b /* [ */) return false
    const closeBracket = state.src.indexOf(']', start + 1)
    if (closeBracket === -1 || closeBracket + 1 >= state.src.length || state.src.charCodeAt(closeBracket + 1) !== 0x7b /* { */) {
      return false
    }
    const closeBrace = state.src.indexOf('}', closeBracket + 2)
    if (closeBrace === -1) return false
    if (silent) return true
    const baseText = state.src.slice(start + 1, closeBracket)
    const rubyText = state.src.slice(closeBracket + 2, closeBrace)
    if (!baseText || !rubyText) return false
    const token = state.push('html_inline', '', 0)
    token.content = `<ruby>${escapeHtml(baseText)}<rp>(</rp><rt>${escapeHtml(rubyText)}</rt><rp>)</rp></ruby>`
    state.pos = closeBrace + 1
    return true
  })

  // Wikilinks: [[页面|别名]] or [[页面]]
  const WIKI_RE = /^\[\[([^\[\]\n]{1,400})\]\]/
  md.inline.ruler.before('link', 'wikilink', (state, silent) => {
    if (!state.src.startsWith('[[', state.pos)) return false
    const match = WIKI_RE.exec(state.src.slice(state.pos))
    if (!match) return false
    if (!silent) {
      const raw = match[1]!.trim()
      const pipe = raw.indexOf('|')
      const target = (pipe >= 0 ? raw.slice(0, pipe) : raw).trim()
      const alias = pipe >= 0 ? raw.slice(pipe + 1).trim() : null
      const token = state.push('html_inline', '', 0)
      token.content = `<a class="wikilink" data-wikilink="${escapeAttr(raw)}" href="#${slugify(target)}">${escapeHtml(alias || target)}</a>`
    }
    state.pos += match[0].length
    return true
  })

  // Block references: ((block-id))
  const BLOCK_REF_RE = /^\(\(([A-Za-z0-9][A-Za-z0-9_-]{0,63})\)\)/
  md.inline.ruler.before('text', 'block_reference', (state, silent) => {
    if (!state.src.startsWith('((', state.pos)) return false
    const match = BLOCK_REF_RE.exec(state.src.slice(state.pos))
    if (!match) return false
    if (!silent) {
      const id = match[1]!
      const token = state.push('html_inline', '', 0)
      token.content = `<a class="block-reference" data-block-ref="${escapeAttr(id)}" href="#%5E${escapeAttr(id)}">((${escapeHtml(id)}))</a>`
    }
    state.pos += match[0].length
    return true
  })

  // Inline tags: #tag
  const TAG_RE = /^#([\p{L}\p{N}_\-/·]{1,60})(?![\p{L}\p{N}_\-/·])/u
  md.inline.ruler.before('text', 'inline_tag', (state, silent) => {
    if (state.src[state.pos] !== '#') return false
    const prev = state.pos > 0 ? state.src[state.pos - 1]! : ' '
    if (!/[\s(\uff08[\u3010>\u300c\u300e\uff0c,\u3001;\uff1b]/.test(prev) && state.pos !== 0) return false
    const match = TAG_RE.exec(state.src.slice(state.pos))
    if (!match) return false
    if (!silent) {
      const tag = match[1]!
      const token = state.push('html_inline', '', 0)
      token.content = `<a href="/tags/${encodeURIComponent(tag)}" class="inline-tag" data-tag="${escapeAttr(tag)}">#${escapeHtml(tag)}</a>`
    }
    state.pos += match[0].length
    return true
  })

  // Note embeds: ![[笔记]]
  const EMBED_RE = /^!\[\[([^\[\]\n]{1,400})\]\]/
  md.inline.ruler.before('image', 'note_embed', (state, silent) => {
    if (!state.src.startsWith('![[', state.pos)) return false
    const match = EMBED_RE.exec(state.src.slice(state.pos))
    if (!match) return false
    if (!silent) {
      const raw = match[1]!.trim()
      const token = state.push('html_inline', '', 0)
      token.content = `<div class="note-embed"><span class="note-embed-head">${escapeHtml(raw)}</span></div>`
    }
    state.pos += match[0].length
    return true
  })

  // Core rule: Block anchors ^anchor-id
  md.core.ruler.push('obsidian_blocks', (state) => {
    for (let index = 0; index < state.tokens.length; index++) {
      const inline = state.tokens[index]!
      if (inline.type !== 'inline') continue
      const prev = state.tokens[index - 1]
      if (!prev || !['paragraph_open', 'heading_open'].includes(prev.type)) continue
      const match = /(?:^|\s)\^([A-Za-z0-9][A-Za-z0-9_-]{0,63})\s*$/.exec(inline.content)
      if (match) {
        const id = match[1]!
        prev.attrSet('id', `^${id}`)
        prev.attrSet('data-block-id', id)
        inline.content = inline.content.slice(0, match.index).trimEnd()
      }
    }
    return true
  })

  // Core rule: Obsidian Callouts (> [!NOTE] ...)
  md.core.ruler.after('github-task-lists', 'obsidian_callouts', (state) => {
    for (let index = 0; index < state.tokens.length; index++) {
      const open = state.tokens[index]!
      if (open.type !== 'blockquote_open') continue
      const pOpen = state.tokens[index + 1]
      const inline = state.tokens[index + 2]
      if (pOpen?.type !== 'paragraph_open' || inline?.type !== 'inline') continue
      const firstBreak = inline.content.indexOf('\n')
      const firstLine = firstBreak >= 0 ? inline.content.slice(0, firstBreak) : inline.content
      const marker = /^\[!([A-Za-z][A-Za-z0-9_-]{0,31})\]([+-])?(?:[ \t]+(.+?))?[ \t]*$/.exec(firstLine)
      if (!marker) continue

      let depth = 0
      let closeIndex = -1
      for (let i = index; i < state.tokens.length; i++) {
        if (state.tokens[i]!.type === 'blockquote_open') depth++
        else if (state.tokens[i]!.type === 'blockquote_close' && --depth === 0) {
          closeIndex = i
          break
        }
      }
      if (closeIndex < 0) continue

      const type = normalizeCalloutType(marker[1]!)
      const fold = marker[2] ?? ''
      const title = marker[3]?.trim() || calloutDefaultTitle(type)

      open.type = 'callout_open'
      open.tag = fold ? 'details' : 'aside'
      open.meta = { type, title, fold }

      const close = state.tokens[closeIndex]!
      close.type = 'callout_close'
      close.tag = open.tag
      close.meta = { fold }

      const remaining = firstBreak >= 0 ? inline.content.slice(firstBreak + 1) : ''
      if (remaining.trim()) {
        inline.content = remaining
        inline.children = []
        md.inline.parse(remaining, md, state.env, inline.children)
      } else {
        const pClose = state.tokens[index + 3]
        if (pClose?.type === 'paragraph_close') state.tokens.splice(index + 1, 3)
      }
    }
    return true
  })

  // Core rule: Extended task list items ([-], [/], [?], [!])
  md.core.ruler.after('github-task-lists', 'extended_task_lists', (state) => {
    for (let index = 2; index < state.tokens.length; index++) {
      const inline = state.tokens[index]!
      const pOpen = state.tokens[index - 1]!
      const item = state.tokens[index - 2]!
      if (inline.type !== 'inline' || pOpen.type !== 'paragraph_open' || item.type !== 'list_item_open' || !inline.children?.length) {
        continue
      }
      const firstChild = inline.children[0]
      if (firstChild?.type === 'text') {
        const extMatch = /^\[([\/\-?!])\][ \t]*/.exec(firstChild.content)
        if (extMatch) {
          const ch = extMatch[1]!
          const status = ch === '/' ? 'in-progress' : ch === '-' ? 'cancelled' : ch === '?' ? 'question' : ch === '!' ? 'important' : 'todo'
          firstChild.content = firstChild.content.slice(extMatch[0].length)
          item.attrJoin('class', `task-list-item task-status-${status}${status === 'cancelled' ? ' cancelled' : ''}`)
          const checkbox = new state.Token('html_inline', '', 0)
          checkbox.content = `<input type="checkbox" class="task-list-item-checkbox" disabled data-task-status="${status}"><span class="task-label">`
          const labelClose = new state.Token('html_inline', '', 0)
          labelClose.content = '</span>'
          inline.children.unshift(checkbox)
          inline.children.push(labelClose)
        }
      }
    }
    return true
  })

  // Renderer rules for details and tabs
  md.renderer.rules.details_open = (tokens, index) => {
    const meta = tokens[index]!.meta as { open: boolean; title: string }
    return `<details class="markdown-details"${meta.open ? ' open' : ''}><summary>${escapeHtml(meta.title)}</summary><div class="markdown-details-content">`
  }
  md.renderer.rules.details_close = () => '</div></details>'

  md.renderer.rules.tabs_open = (tokens, index) => {
    const { titles, selectedIndex } = tokens[index]!.meta as { titles: string[]; selectedIndex: number }
    const buttons = titles
      .map(
        (title, i) =>
          `<button type="button" role="tab" aria-selected="${i === selectedIndex ? 'true' : 'false'}" data-tab-button="${i}">${escapeHtml(title)}</button>`
      )
      .join('')
    return `<div class="markdown-tabs" data-tabs><div class="tab-list" role="tablist">${buttons}</div>`
  }
  md.renderer.rules.tabs_close = () => '</div>'

  md.renderer.rules.tab_panel_open = (tokens, index) => {
    const { tabIndex, selected } = tokens[index]!.meta as { tabIndex: number; selected: boolean }
    return `<section class="tab-panel" role="tabpanel" data-tab-panel="${tabIndex}"${selected ? '' : ' hidden'}>`
  }
  md.renderer.rules.tab_panel_close = () => '</section>'

  // Renderer rules for callouts
  md.renderer.rules.callout_open = (tokens, index) => {
    const { type, title, fold } = tokens[index]!.meta as { type: string; title: string; fold: string }
    if (fold) {
      return `<details class="callout callout-${escapeAttr(type)}" data-callout="${escapeAttr(type)}"${fold === '+' ? ' open' : ''}><summary class="callout-title">${escapeHtml(title)}</summary><div class="callout-content">`
    }
    return `<aside class="callout callout-${escapeAttr(type)}" data-callout="${escapeAttr(type)}"><div class="callout-title">${escapeHtml(title)}</div><div class="callout-content">`
  }
  md.renderer.rules.callout_close = (tokens, index) => {
    const { fold } = tokens[index]!.meta as { fold: string }
    return `</div>${fold ? '</details>' : '</aside>'}`
  }

  // Math rendering
  md.renderer.rules.math_inline = (tokens, idx) => {
    const formula = tokens[idx]!.content
    try {
      return katex.renderToString(formula, { displayMode: false, throwOnError: false })
    } catch {
      return `<code class="math-error">${escapeHtml(formula)}</code>`
    }
  }

  md.renderer.rules.math_block = (tokens, idx) => {
    const formula = tokens[idx]!.content
    try {
      return `<div class="katex-display">${katex.renderToString(formula, { displayMode: true, throwOnError: false })}</div>`
    } catch {
      return `<pre class="math-error"><code>${escapeHtml(formula)}</code></pre>`
    }
  }

  // Table wrapping
  md.renderer.rules.table_open = () => '<div class="table-wrap"><table>'
  md.renderer.rules.table_close = () => '</table></div>'

  const defaultThOpen = md.renderer.rules.th_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.th_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!
    const style = token.attrGet('style')
    const alignMatch = style ? /text-align:\s*(center|right|left)/i.exec(style) : null
    if (alignMatch) token.attrSet('align', alignMatch[1]!.toLowerCase())
    return defaultThOpen(tokens, idx, options, env, self)
  }

  const defaultTdOpen = md.renderer.rules.td_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.td_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!
    const style = token.attrGet('style')
    const alignMatch = style ? /text-align:\s*(center|right|left)/i.exec(style) : null
    if (alignMatch) token.attrSet('align', alignMatch[1]!.toLowerCase())
    return defaultTdOpen(tokens, idx, options, env, self)
  }

  // Fences: mermaid, chart, md-example, js-example, code
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]!
    const info = parseFenceInfo(token.info)
    const lang = info.language
    const code = token.content

    // 1. Mermaid diagram block
    if (lang === 'mermaid') {
      return `<div class="mermaid-block loading" data-mermaid="${encodeURIComponent(code)}" aria-busy="true">正在加载图表...</div>`
    }

    // 2. Chart.js block
    if (lang === 'chart' || lang === 'chartjs') {
      return `<div class="chartjs-block loading" data-chart="${encodeURIComponent(code)}" aria-busy="true">正在加载图表...</div>`
    }

    // 3. md-example comparison block
    if (lang === 'md-example' || lang === 'markdown-example') {
      const title = info.title || 'Markdown 演示'
      const previewHtml = renderMarkdown(code).html
      return [
        `<section class="markdown-example">`,
        `<div class="markdown-example-head"><span class="markdown-example-title">${escapeHtml(title)}</span></div>`,
        `<div class="markdown-example-grid">`,
        `<section class="markdown-example-preview" aria-label="预览">`,
        `<div class="markdown-example-preview-body">${previewHtml}</div>`,
        `</section>`,
        `<section class="markdown-example-source" aria-label="源码">`,
        `<div class="code-block markdown-example-code" data-lang="markdown">`,
        `<button class="code-copy markdown-example-copy" data-copy type="button" aria-label="复制代码">复制</button>`,
        `<pre><code>${escapeHtml(code)}</code></pre>`,
        `</div>`,
        `</section>`,
        `</div>`,
        `</section>`,
      ].join('')
    }

    // 4. javascript-example runnable block
    if (lang === 'javascript-example' || lang === 'js-example') {
      const title = info.title || '可运行 JavaScript 代码'
      const highlighted = highlightCode(code, 'javascript') || escapeHtml(code)
      const lined = splitHtmlIntoLines(highlighted, 1, [])
      return [
        `<section class="markdown-example js-example-block">`,
        `<div class="markdown-example-head js-example-head">`,
        `<span class="markdown-example-title js-example-title">`,
        `<span class="js-example-badge">JS</span>`,
        `<span>${escapeHtml(title)}</span>`,
        `</span>`,
        `<div class="js-example-controls">`,
        `<label class="js-example-switch-wrap" title="显示行号">`,
        `<span class="js-example-switch-label">行号</span>`,
        `<button type="button" role="switch" class="js-example-switch is-checked" data-js-switch="line-numbers" aria-checked="true" aria-label="行号">`,
        `<span class="js-example-switch-thumb"></span>`,
        `</button>`,
        `</label>`,
        `<button type="button" class="js-example-run-btn" data-js-run title="运行代码">`,
        `<span class="js-example-run-icon">▶</span>`,
        `<span>运行</span>`,
        `</button>`,
        `</div>`,
        `</div>`,
        `<div class="markdown-example-grid js-example-grid">`,
        `<section class="markdown-example-source js-example-source" aria-label="JavaScript">`,
        `<div class="code-block markdown-example-code has-line-numbers" data-lang="javascript" data-code-start="1" data-line-numbers="true">`,
        `<button class="code-copy markdown-example-copy" data-copy type="button" aria-label="复制代码">复制</button>`,
        `<pre><code class="language-javascript">${lined}</code></pre>`,
        `</div>`,
        `</section>`,
        `<section class="markdown-example-preview js-example-output" aria-label="运行结果">`,
        `<div class="js-example-output-head">`,
        `<span class="js-example-output-title">运行结果</span>`,
        `<span class="js-example-output-status"></span>`,
        `</div>`,
        `<div class="js-example-output-body">`,
        `<div class="js-example-placeholder">点击运行查看执行结果</div>`,
        `</div>`,
        `</section>`,
        `</div>`,
        `</section>`,
      ].join('')
    }

    // 5. Standard code block
    const highlighted = highlightCode(code, lang) || escapeHtml(code)
    const formattedLines = splitHtmlIntoLines(highlighted, info.startLine, info.highlightedLines)
    const title = info.title || (info.language ? info.language.toUpperCase() : 'CODE')

    return [
      `<div class="code-block${info.lineNumbers ? ' has-line-numbers' : ''}" data-lang="${escapeAttr(lang)}">`,
      `<div class="code-block-head">`,
      `<span class="code-title">${escapeHtml(title)}</span>`,
      info.title && info.language ? `<span class="code-lang">${escapeHtml(info.language)}</span>` : '',
      `<button type="button" class="code-copy" data-copy>复制</button>`,
      `</div>`,
      `<pre><code class="language-${escapeAttr(lang)}">${formattedLines}</code></pre>`,
      `</div>`,
    ].join('')
  }

  // Heading anchor collection
  const defaultHeadingOpen =
    md.renderer.rules.heading_open ||
    function (tokens, idx, options, _env, self) {
      return self.renderToken(tokens, idx, options)
    }

  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!
    const level = parseInt(token.tag.slice(1), 10)
    const nextToken = tokens[idx + 1]

    if (nextToken && nextToken.type === 'inline') {
      const title = nextToken.content
      let baseSlug = slugify(title) || `heading-${headings.length + 1}`
      let slug = baseSlug
      let count = 1
      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${count++}`
      }
      usedSlugs.add(slug)

      token.attrSet('id', slug)
      token.attrJoin('class', 'group relative')

      headings.push({
        level,
        text: title,
        slug,
      })
    }

    return defaultHeadingOpen(tokens, idx, options, env, self)
  }

  // Render TOC token
  md.renderer.rules.toc = () => {
    if (!headings.length) {
      return '<nav class="table-of-contents empty"><div class="toc-title">目录</div></nav>'
    }
    const items = headings
      .map(
        (h) =>
          `<li class="toc-item toc-level-${h.level}"><a href="#${escapeAttr(h.slug)}" class="toc-link">${escapeHtml(h.text)}</a></li>`
      )
      .join('')
    return `<nav class="table-of-contents"><div class="toc-title">目录</div><ul class="toc-list">${items}</ul></nav>`
  }

  const html = md.render(content)
  return { html, headings }
}
