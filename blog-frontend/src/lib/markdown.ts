import MarkdownIt from 'markdown-it'
import katex from 'katex'
import { highlightCode } from './prism'

export interface TocHeading {
  level: number
  text: string
  slug: string
}

export interface RenderResult {
  html: string
  headings: TocHeading[]
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
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

  const headings: TocHeading[] = []
  const usedSlugs = new Set<string>()

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: false,
    langPrefix: 'language-',
  })

  // 2. Inline math rule: $...$
  const MATH_INLINE = /^\$(?!\s)((?:[^$\\]|\\.)+?)(?<!\s)\$/
  md.inline.ruler.before('escape', 'math_inline', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x24 /* $ */) {
      return false
    }
    // Avoid $$ matching here
    if (state.src.charCodeAt(state.pos + 1) === 0x24) {
      return false
    }
    const match = MATH_INLINE.exec(state.src.slice(state.pos))
    if (!match) return false
    if (!silent) {
      const token = state.push('math_inline', 'span', 0)
      token.content = match[1]!
    }
    state.pos += match[0].length
    return true
  })

  // 3. Block math rule: $$...$$
  md.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
    let pos = state.bMarks[startLine]! + state.tShift[startLine]!
    const max = state.eMarks[startLine]!
    if (pos + 2 > max) return false
    if (state.src.charCodeAt(pos) !== 0x24 || state.src.charCodeAt(pos + 1) !== 0x24) return false

    pos += 2
    let firstLine = state.src.slice(pos, max).trim()

    if (silent) return true

    // Check if it's a single line block $$...$$
    if (firstLine.endsWith('$$')) {
      firstLine = firstLine.slice(0, -2).trim()
      const token = state.push('math_block', 'div', 0)
      token.block = true
      token.content = firstLine
      state.line = startLine + 1
      return true
    }

    let nextLine = startLine
    let closed = false

    while (nextLine < endLine) {
      nextLine++
      if (nextLine >= endLine) break
      pos = state.bMarks[nextLine]! + state.tShift[nextLine]!
      const endMax = state.eMarks[nextLine]!
      const lineText = state.src.slice(pos, endMax).trim()
      if (lineText.endsWith('$$')) {
        closed = true
        break
      }
    }

    const contentLines: string[] = []
    if (firstLine) contentLines.push(firstLine)
    for (let i = startLine + 1; i < nextLine; i++) {
      const p = state.bMarks[i]! + state.tShift[i]!
      const m = state.eMarks[i]!
      contentLines.push(state.src.slice(p, m))
    }
    // Last line if closed with text before $$
    if (closed && nextLine < endLine) {
      const p = state.bMarks[nextLine]! + state.tShift[nextLine]!
      const m = state.eMarks[nextLine]!
      const last = state.src.slice(p, m).trim()
      const beforeClose = last.slice(0, -2).trim()
      if (beforeClose) contentLines.push(beforeClose)
    }

    const token = state.push('math_block', 'div', 0)
    token.block = true
    token.content = contentLines.join('\n')
    state.line = nextLine + 1
    return true
  })

  // 4. Renderer rules for math
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

  // 5. Code Fence with custom Inkstone code-block styling and Prism highlighting
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]!
    const info = token.info ? token.info.trim() : ''
    const lang = info.split(/\s+/)[0] || 'text'
    const code = token.content

    const highlighted = highlightCode(code, lang) || escapeHtml(code)
    const escapedCodeForJs = encodeURIComponent(code)

    return `<div class="code-block">
  <div class="code-block-head">
    <span class="code-lang">${escapeHtml(lang)}</span>
    <button type="button" class="code-copy" onclick="navigator.clipboard.writeText(decodeURIComponent('${escapedCodeForJs}')); this.innerText='已复制'; setTimeout(()=>this.innerText='复制', 2000);">复制</button>
  </div>
  <pre><code class="language-${escapeHtml(lang)}">${highlighted}</code></pre>
</div>`
  }

  // 6. Heading anchor & TOC collection
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

  const html = md.render(content)
  return { html, headings }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
