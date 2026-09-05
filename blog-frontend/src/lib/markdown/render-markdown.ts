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
import type { Token } from 'markdown-it'
import { highlightCode } from '../prism.ts'
import { escapeAttr, escapeHtml } from './escape.ts'
import { slugify } from './slugify.ts'
import { stripFrontmatter } from '../content.ts'
import { stripObsidianComments } from './obsidian.ts'
import { parseFenceInfo, splitHtmlIntoLines } from './fence.ts'
import type { FenceInfo } from './types.ts'
import { registerBlockRules } from './rules/block.ts'
import { registerCoreRules } from './rules/core.ts'
import { registerInlineRules } from './rules/inline.ts'
import { registerRendererRules } from './rules/renderer.ts'
import type { RenderResult, TocHeading } from './types.ts'

function createMarkdownRenderer(headings: TocHeading[]): InstanceType<typeof MarkdownIt> {
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
    .use(anchor, {
      slugify,
      permalink: anchor.permalink.linkInsideHeader({
        symbol: '',
        placement: 'before',
        class: 'heading-anchor',
        ariaHidden: true,
      }),
    })

  // Custom Obsidian-style rules
  registerInlineRules(md)
  registerBlockRules(md)
  registerCoreRules(md, headings)
  registerRendererRules(md, headings)

  return md
}

function renderMermaidFence(code: string): string {
  return `<div class="mermaid-block loading" data-mermaid="${encodeURIComponent(code)}" aria-busy="true">正在加载图表...</div>`
}

function renderChartFence(code: string): string {
  return `<div class="chartjs-block loading" data-chart="${encodeURIComponent(code)}" aria-busy="true">正在加载图表...</div>`
}

function renderMarkdownExampleFence(code: string, title: string): string {
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

function renderJsExampleFence(code: string, title: string): string {
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

function renderCodeFence(info: FenceInfo, code: string): string {
  const lang = info.language
  const highlighted = highlightCode(code, lang) || escapeHtml(code)
  const formattedLines = splitHtmlIntoLines(highlighted, info.startLine, info.highlightedLines)
  const title = info.title || (info.language ? info.language.toUpperCase() : 'CODE')

  return [
    `<div class="code-block${info.lineNumbers ? ' has-line-numbers' : ''}" data-lang="${escapeAttr(lang)}" data-code-start="${info.startLine}"${info.lineNumbers ? ' data-line-numbers="true"' : ''}${info.highlightedLines.length ? ` data-highlight-lines="${info.highlightedLines.join(',')}"` : ''}>`,
    `<div class="code-block-head">`,
    `<span class="code-title">${escapeHtml(title)}</span>`,
    info.title && info.language ? `<span class="code-lang">${escapeHtml(info.language)}</span>` : '',
    `<button type="button" class="code-copy" data-copy>复制</button>`,
    `</div>`,
    `<pre><code class="language-${escapeAttr(lang)}">${formattedLines}</code></pre>`,
    `</div>`,
  ].join('')
}

function renderFence(tokens: Token[], idx: number): string {
  const token = tokens[idx]!
  const info = parseFenceInfo(token.info)
  const code = token.content
  const lang = info.language

  // 1. Mermaid diagram block
  if (lang === 'mermaid') {
    return renderMermaidFence(code)
  }

  // 2. Chart.js block
  if (lang === 'chart' || lang === 'chartjs') {
    return renderChartFence(code)
  }

  // 3. md-example comparison block
  if (lang === 'md-example' || lang === 'markdown-example') {
    return renderMarkdownExampleFence(code, info.title || 'Markdown 演示')
  }

  // 4. javascript-example runnable block
  if (lang === 'javascript-example' || lang === 'js-example') {
    return renderJsExampleFence(code, info.title || '可运行 JavaScript 代码')
  }

  // 5. Standard code block
  return renderCodeFence(info, code)
}

export function renderMarkdown(rawMarkdown: string): RenderResult {
  if (!rawMarkdown) {
    return { html: '', headings: [] }
  }

  // 1. Strip YAML frontmatter if present
  let content = stripFrontmatter(rawMarkdown)

  // 2. Strip Obsidian comments
  content = stripObsidianComments(content)

  const headings: TocHeading[] = []
  const md = createMarkdownRenderer(headings)

  // Fences: mermaid, chart, md-example, js-example, code
  md.renderer.rules.fence = renderFence

  const html = md.render(content)
  return { html, headings }
}