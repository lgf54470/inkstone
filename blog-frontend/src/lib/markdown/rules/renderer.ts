import MarkdownIt from 'markdown-it'
import katex from 'katex'
import { escapeAttr, escapeHtml } from '../escape.ts'
import type { RenderEnv } from '../types.ts'
import { TABLE_OPTION_DEFAULTS, type TableOptions } from '../table-options.ts'
import { registerPanels } from '../panels.ts'

function registerDetailsRendererRules(md: InstanceType<typeof MarkdownIt>): void {
  md.renderer.rules.details_open = (tokens, index) => {
    const meta = tokens[index]!.meta as { open: boolean; title: string; variant?: string }
    const variant = meta.variant && meta.variant !== 'default' ? ` data-details-variant="${escapeAttr(meta.variant)}"` : ''
    return `<details class="markdown-details"${meta.open ? ' open' : ''}${variant}>`
  }
  // The summary title is inline markdown (emphasis, code, links…), same rule the root app renders.
  // markdown-it v15 requires an env object on renderInline (it reads env.references).
  md.renderer.rules.details_summary = (tokens, index, _options, env) =>
    `<summary>${md.renderInline(tokens[index]!.content, (env ?? {}) as Record<string, unknown>)}</summary>`
  md.renderer.rules.details_close = () => '</details>'
}

function registerContainerRendererRules(md: InstanceType<typeof MarkdownIt>): void {
  // Renderer rules for details, table style containers and tabs
  registerDetailsRendererRules(md)
  registerTableWrapRules(md)

  md.renderer.rules.tabs_open = (tokens, index) => {
    const { titles, selectedIndex, options } = tokens[index]!.meta as {
      titles: string[]
      selectedIndex: number
      options?: {
        style: 'horizontal' | 'vertical'
        variant: 'default' | 'pills' | 'cards' | 'minimal'
        align: 'start' | 'center' | 'end' | 'stretch'
        position?: 'top' | 'bottom' | 'left' | 'right'
        sync?: string
      }
    }
    const opt = options ?? { style: 'horizontal', variant: 'default', align: 'start' }
    const effectivePosition = opt.position ?? (opt.style === 'vertical' ? 'left' : 'top')
    const vertical = effectivePosition === 'left' || effectivePosition === 'right'
    const buttons = titles
      .map(
        (title, i) =>
          `<button type="button" role="tab" aria-selected="${i === selectedIndex ? 'true' : 'false'}" data-tab-button="${i}">${escapeHtml(title)}</button>`
      )
      .join('')
    const styleAttr = vertical ? ' data-tabs-style="vertical"' : ''
    const variantAttr = opt.variant !== 'default' ? ` data-tabs-variant="${opt.variant}"` : ''
    const alignAttr = opt.align !== 'start' ? ` data-tabs-align="${opt.align}"` : ''
    const positionAttr = opt.position ? ` data-tabs-position="${opt.position}"` : ''
    const syncAttr = opt.sync ? ` data-tabs-sync="${escapeAttr(opt.sync)}"` : ''
    return `<div class="markdown-tabs-outer"><div class="markdown-tabs" data-tabs${styleAttr}${variantAttr}${alignAttr}${positionAttr}${syncAttr}><div class="tab-list" role="tablist">${buttons}</div>`
  }
  md.renderer.rules.tabs_close = () => '</div></div>'

  md.renderer.rules.tab_panel_open = (tokens, index) => {
    const { tabIndex, selected } = tokens[index]!.meta as { tabIndex: number; selected: boolean }
    return `<section class="tab-panel" role="tabpanel" data-tab-panel="${tabIndex}"${selected ? '' : ' hidden'}>`
  }
  md.renderer.rules.tab_panel_close = () => '</section>'
}

function registerTableWrapRules(md: InstanceType<typeof MarkdownIt>): void {
  md.renderer.rules.table_wrap_open = (tokens, index) => {
    const options = (tokens[index]!.meta as { options?: TableOptions } | undefined)?.options ?? TABLE_OPTION_DEFAULTS
    const state = [
      ` data-table-density="${escapeAttr(options.density)}"`,
      options.zebra ? ' data-table-zebra="true"' : '',
      ` data-table-frames="${escapeAttr(options.frames)}"`,
    ].join('')
    return `<div class="markdown-table"${state}>`
  }
  md.renderer.rules.table_wrap_close = () => '</div>'
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

function registerTocRendererRule(md: InstanceType<typeof MarkdownIt>): void {
  // Render TOC token from per-render env headings
  md.renderer.rules.toc = (_tokens, _idx, _options, env) => {
    const headings = (env as RenderEnv).headings
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

export function registerRendererRules(md: InstanceType<typeof MarkdownIt>): void {
  registerContainerRendererRules(md)
  registerCalloutRendererRules(md)
  registerPanels(md)
  registerMathRendererRules(md)
  registerTableRendererRules(md)
  registerTocRendererRule(md)
}