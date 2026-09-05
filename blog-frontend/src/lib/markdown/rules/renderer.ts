import MarkdownIt from 'markdown-it'
import katex from 'katex'
import { escapeAttr, escapeHtml } from '../escape.ts'
import type { TocHeading } from '../types.ts'

function registerContainerRendererRules(md: InstanceType<typeof MarkdownIt>): void {
  // Renderer rules for details and tabs
  md.renderer.rules.details_open = (tokens, index) => {
    const meta = tokens[index]!.meta as { open: boolean; title: string }
    return `<details class="markdown-details"${meta.open ? ' open' : ''}><summary>${escapeHtml(meta.title)}</summary>`
  }
  md.renderer.rules.details_close = () => '</details>'

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
}

function registerCalloutRendererRules(md: InstanceType<typeof MarkdownIt>): void {
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
}

function registerMathRendererRules(md: InstanceType<typeof MarkdownIt>): void {
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
      return `<div class="math-block">${katex.renderToString(formula, { displayMode: true, throwOnError: false })}</div>`
    } catch {
      return `<pre class="math-error"><code>${escapeHtml(formula)}</code></pre>`
    }
  }
}

function registerTableRendererRules(md: InstanceType<typeof MarkdownIt>): void {
  // Table wrapping
  md.renderer.rules.table_open = () => '<div class="table-wrap"><table>'
  md.renderer.rules.table_close = () => '</table></div>'

  const defaultThOpen = md.renderer.rules.th_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.th_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!
    const style = token.attrGet('style')
    const alignMatch = typeof style === 'string' ? /text-align:\s*(center|right|left)/i.exec(style) : null
    if (alignMatch) token.attrSet('align', alignMatch[1]!.toLowerCase())
    return defaultThOpen(tokens, idx, options, env, self)
  }

  const defaultTdOpen = md.renderer.rules.td_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.td_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!
    const style = token.attrGet('style')
    const alignMatch = typeof style === 'string' ? /text-align:\s*(center|right|left)/i.exec(style) : null
    if (alignMatch) token.attrSet('align', alignMatch[1]!.toLowerCase())
    return defaultTdOpen(tokens, idx, options, env, self)
  }
}

function registerHeadingRendererRule(md: InstanceType<typeof MarkdownIt>): void {
  // Heading anchor styling
  const defaultHeadingOpen =
    md.renderer.rules.heading_open ||
    function (tokens, idx, options, _env, self) {
      return self.renderToken(tokens, idx, options)
    }

  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!
    token.attrJoin('class', 'group relative')
    return defaultHeadingOpen(tokens, idx, options, env, self)
  }
}

function registerTocRendererRule(md: InstanceType<typeof MarkdownIt>, headings: TocHeading[]): void {
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
}

export function registerRendererRules(md: InstanceType<typeof MarkdownIt>, headings: TocHeading[]): void {
  registerContainerRendererRules(md)
  registerCalloutRendererRules(md)
  registerMathRendererRules(md)
  registerTableRendererRules(md)
  registerHeadingRendererRule(md)
  registerTocRendererRule(md, headings)
}