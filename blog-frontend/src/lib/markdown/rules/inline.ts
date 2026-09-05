import MarkdownIt from 'markdown-it'
import { escapeAttr, escapeHtml } from '../escape.ts'
import { slugify } from '../slugify.ts'

function registerMathInlineRule(md: InstanceType<typeof MarkdownIt>): void {
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
}

function registerRubyRule(md: InstanceType<typeof MarkdownIt>): void {
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
}

function registerWikilinkRule(md: InstanceType<typeof MarkdownIt>): void {
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
}

function registerBlockReferenceRule(md: InstanceType<typeof MarkdownIt>): void {
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
}

function registerInlineTagRule(md: InstanceType<typeof MarkdownIt>): void {
  // Inline tags: #tag
  const TAG_RE = /^#([\p{L}\p{N}_\-\/·]{1,60})(?![\p{L}\p{N}_\-\/·])/u
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
}

function registerNoteEmbedRule(md: InstanceType<typeof MarkdownIt>): void {
  // Note embeds: ![[笔记]]
  const EMBED_RE = /^!\[\[([^\[\]\n]{1,400})\]\]/
  md.inline.ruler.before('image', 'note_embed', (state, silent) => {
    if (!state.src.startsWith('![[', state.pos)) return false
    const match = EMBED_RE.exec(state.src.slice(state.pos))
    if (!match) return false
    if (!silent) {
      const raw = match[1]!.trim()
      const token = state.push('html_inline', '', 0)
      token.content = `<div class="note-embed"><span class="note-embed-head">${escapeHtml(raw)}</span><div class="note-embed-body"><p class="text-xs text-[var(--text-tertiary)] italic">嵌入笔记：${escapeHtml(raw)}</p></div></div>`
    }
    state.pos += match[0].length
    return true
  })
}

export function registerInlineRules(md: InstanceType<typeof MarkdownIt>): void {
  registerMathInlineRule(md)
  registerRubyRule(md)
  registerWikilinkRule(md)
  registerBlockReferenceRule(md)
  registerInlineTagRule(md)
  registerNoteEmbedRule(md)
}