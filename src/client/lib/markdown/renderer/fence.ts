import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import { escapeHtml } from '@shared/escape'
import { t } from '../../i18n'
import { encodeDataValue } from '../data-attr'
import { EXCALIDRAW_LANGUAGES } from '../excalidraw'
import { detectKanbanMode, KANBAN_LANGUAGES } from '../kanban'
import { detectSlidesMode, BENTO_SLIDES_LANGUAGES } from '../slides'
import { detectMindmapMode, MINDMAP_LANGUAGES, MINDMAP_THEME_ATTR, readFenceAnnotation } from '../mindmap'
import { emptyEnvironment, renderEnv } from './env'
import { stripObsidianComments, parseFenceInfo } from './parse'
import type { FenceInfo } from './types'
import { escapeAttr } from './util'

function renderMarkdownExample(md: MarkdownIt, token: Token, line: string, rendererEnv: unknown, info: FenceInfo): string {
  const parentEnv = renderEnv(rendererEnv)
  const exampleId = ++parentEnv.exampleSequence
  const childEnv = emptyEnvironment()
  childEnv.taskNonce = parentEnv.taskNonce
  childEnv.tabSequence = parentEnv.tabSequence
  childEnv.exampleSequence = parentEnv.exampleSequence
  childEnv.mindmapSequence = parentEnv.mindmapSequence
  childEnv.docId = `${parentEnv.docId}-example-${exampleId}`
  childEnv.externalImages = parentEnv.externalImages
  const preview = md.render(stripObsidianComments(token.content), childEnv).replace(/ data-line="\d+"/g, '')
  parentEnv.hasMath ||= childEnv.hasMath
  parentEnv.hasMermaid ||= childEnv.hasMermaid
  parentEnv.hasChart ||= childEnv.hasChart
  parentEnv.hasMindmap ||= childEnv.hasMindmap
  parentEnv.hasEmbeds ||= childEnv.hasEmbeds
  parentEnv.tabSequence = childEnv.tabSequence
  parentEnv.exampleSequence = Math.max(parentEnv.exampleSequence, childEnv.exampleSequence)
  parentEnv.mindmapSequence = Math.max(parentEnv.mindmapSequence, childEnv.mindmapSequence)
  const title = info.title || t('markdown.markdown_example')
  const titleId = `${parentEnv.docId}-markdown-example-${exampleId}`
  return [
    `<section class="markdown-example"${line} aria-labelledby="${titleId}">`,
    `<div class="markdown-example-head"><span class="markdown-example-title" id="${titleId}">${escapeHtml(title)}</span></div>`,
    `<div class="markdown-example-grid">`,
    `<section class="markdown-example-preview" aria-label="${escapeAttr(t('common.preview'))}" data-markdown-example-id="${exampleId}" data-markdown-example="${escapeAttr(encodeDataValue(token.content))}">`,
    `<div class="markdown-example-preview-body">${preview}</div>`,
    `</section>`,
    `<section class="markdown-example-source" aria-label="Markdown">`,
    `<div class="code-block markdown-example-code" data-lang="markdown" data-code-start="1">`,
    `<button class="code-copy markdown-example-copy" data-copy type="button" aria-label="${escapeAttr(t('markdown.copy_code'))}">${escapeHtml(t('common.copy'))}</button>`,
    `<pre><code>${escapeHtml(token.content)}</code></pre>`,
    `</div>`,
    `</section>`,
    `</div>`,
    `</section>`,
  ].join('')
}

function renderJavaScriptExample(token: Token, line: string, info: FenceInfo): string {
  const title = info.title || t('workspace.runnable_javascript_code')
  return [
    `<section class="markdown-example js-example-block"${line}>`,
    `<div class="markdown-example-head js-example-head">`,
    `<span class="markdown-example-title js-example-title">`,
    `<span class="js-example-badge">JS</span>`,
    `<span>${escapeHtml(title)}</span>`,
    `</span>`,
    `<div class="js-example-controls">`,
    `<label class="js-example-switch-wrap" title="${escapeAttr(t('workspace.toggle_line_numbers'))}">`,
    `<span class="js-example-switch-label">${escapeHtml(t('workspace.line_numbers'))}</span>`,
    `<button type="button" role="switch" class="js-example-switch is-checked" data-js-switch="line-numbers" aria-checked="true" aria-label="${escapeAttr(t('workspace.line_numbers'))}">`,
    `<span class="js-example-switch-thumb"></span>`,
    `</button>`,
    `</label>`,
    `<button type="button" class="js-example-run-btn" data-js-run title="${escapeAttr(t('workspace.run_code'))}">`,
    `<span class="js-example-run-icon">▶</span>`,
    `<span>${escapeHtml(t('workspace.run'))}</span>`,
    `</button>`,
    `</div>`,
    `</div>`,
    `<div class="markdown-example-grid js-example-grid">`,
    `<section class="markdown-example-source js-example-source" aria-label="JavaScript">`,
    `<div class="code-block markdown-example-code has-line-numbers" data-lang="javascript" data-code-start="1" data-line-numbers="true">`,
    `<button class="code-copy markdown-example-copy" data-copy type="button" aria-label="${escapeAttr(t('markdown.copy_code'))}">${escapeHtml(t('common.copy'))}</button>`,
    `<pre><code class="language-javascript">${escapeHtml(token.content)}</code></pre>`,
    `</div>`,
    `</section>`,
    `<section class="markdown-example-preview js-example-output" aria-label="${escapeAttr(t('workspace.execution_result'))}">`,
    `<div class="js-example-output-head">`,
    `<span class="js-example-output-title">${escapeHtml(t('workspace.execution_result'))}</span>`,
    `<span class="js-example-output-status"></span>`,
    `</div>`,
    `<div class="js-example-output-body">`,
    `<div class="js-example-placeholder">${escapeHtml(t('workspace.click_run_to_execute'))}</div>`,
    `</div>`,
    `</section>`,
    `</div>`,
    `</section>`,
  ].join('')
}

function renderFence(md: MarkdownIt, tokens: Token[], index: number, rendererEnv: unknown): string {
  const token = tokens[index]!
  const info = parseFenceInfo(token.info)
  const line = token.map ? ` data-line="${token.map[0]}"` : ''
  if (info.language === 'md-example' || info.language === 'markdown-example')
    return renderMarkdownExample(md, token, line, rendererEnv, info)
  if (info.language === 'javascript-example' || info.language === 'js-example')
    return renderJavaScriptExample(token, line, info)
  if (info.language === 'mermaid') {
    renderEnv(rendererEnv).hasMermaid = true
    return `<div class="mermaid-block loading"${line} data-mermaid="${escapeAttr(encodeDataValue(token.content))}" aria-busy="true">${escapeHtml(t('markdown.rendering_diagram'))}</div>`
  }
  if (info.language === 'chart' || info.language === 'chartjs') {
    renderEnv(rendererEnv).hasChart = true
    return `<div class="chartjs-block loading"${line} data-chart="${escapeAttr(encodeDataValue(token.content))}" aria-busy="true">${escapeHtml(t('markdown.rendering_chart'))}</div>`
  }
  if ((MINDMAP_LANGUAGES as readonly string[]).includes(info.language))
    return renderMindmapBlock(token, line, rendererEnv)
  if ((EXCALIDRAW_LANGUAGES as readonly string[]).includes(info.language))
    return renderExcalidrawBlock(token, line, rendererEnv)
  if ((KANBAN_LANGUAGES as readonly string[]).includes(info.language))
    return renderKanbanBlock(token, line, rendererEnv)
  if ((BENTO_SLIDES_LANGUAGES as readonly string[]).includes(info.language))
    return renderBentoSlidesBlock(token, line, rendererEnv)
  const title = info.title || info.language || t('markdown.code')
  return [
    `<div class="code-block${info.lineNumbers ? ' has-line-numbers' : ''}"${line} data-lang="${escapeAttr(info.language)}" data-code-start="${info.startLine}"${info.lineNumbers ? ' data-line-numbers="true"' : ''}${info.highlightedLines.length ? ` data-highlight-lines="${info.highlightedLines.join(',')}"` : ''}>`,
    `<div class="code-block-head">`,
    `<span class="code-title">${escapeHtml(title)}</span>`,
    info.title && info.language ? `<span class="code-lang">${escapeHtml(info.language)}</span>` : '',
    `<button class="code-copy" data-copy type="button" aria-label="${escapeAttr(t('markdown.copy_code'))}">${escapeHtml(t('common.copy'))}</button>`,
    `</div>`,
    `<pre><code>${escapeHtml(token.content)}</code></pre>`,
    `</div>`,
  ].join('')
}
/**
 * The header's palette control. It ships as a button carrying the classic name of the
 * palette a fence without one draws with; the registry replaces the text with what the
 * map actually draws with, and the menu itself is a React overlay (the prose whitelist
 * keeps form controls out, so a button and an app menu is the shape available).
 */
function renderThemePicker(): string {
  const label = escapeAttr(t('preview.mindmap_theme'))
  return `<button type="button" class="mindmap-block-theme" data-mindmap-theme-pick aria-haspopup="menu" aria-expanded="false" aria-label="${label}" title="${label}">${escapeHtml(t('preview.mindmap_theme_auto'))}</button>`
}

function renderMindmapBlock(token: Token, line: string, rendererEnv: unknown): string {
  const env = renderEnv(rendererEnv)
  env.hasMindmap = true
  const index = env.mindmapSequence++
  const body = token.content
  const mode = detectMindmapMode(body)
  const modeLabel = mode === 'json' ? t('preview.mindmap_mode_json') : t('preview.mindmap_mode_outline')
  const fitLabel = escapeAttr(t('preview.mindmap_fit'))
  const fullscreenLabel = escapeAttr(t('preview.mindmap_fullscreen'))
  // The fence's own palette, as written in its info string; the registry reads it and
  // hands it to the same reader the JSON body's field goes through (see mindmap/theme).
  const annotation = readFenceAnnotation(token.info)
  return [
    `<div class="mindmap-block loading"${line} data-mindmap="${escapeAttr(encodeDataValue(body))}" data-mindmap-mode="${mode}" data-mindmap-index="${index}"${annotation === null ? '' : ` ${MINDMAP_THEME_ATTR}="${escapeAttr(annotation)}"`} aria-busy="true">`,
    `<div class="mindmap-block-head">`,
    `<span class="mindmap-block-title">${escapeHtml(t('preview.mindmap'))}</span>`,
    `<span class="mindmap-block-mode">${escapeHtml(modeLabel)}</span>`,
    `<span class="mindmap-block-actions">`,
    renderThemePicker(),
    `<button type="button" class="mindmap-block-btn" data-mindmap-fit aria-label="${fitLabel}" title="${fitLabel}"></button>`,
    `<button type="button" class="mindmap-block-btn" data-mindmap-fullscreen aria-label="${fullscreenLabel}" title="${fullscreenLabel}"></button>`,
    `</span>`,
    `</div>`,
    `<div class="mindmap-block-placeholder" data-mindmap-placeholder>${escapeHtml(t('preview.mindmap_loading'))}</div>`,
    `</div>`,
  ].join('')
}

/**
 * The whiteboard placeholder. The scene travels in `data-excalidraw` (the same
 * encoded attribute a mind map uses) and the board is mounted into the placeholder
 * after the markup is committed, so a keystroke in the editor never rebuilds it.
 */
function renderExcalidrawBlock(token: Token, line: string, rendererEnv: unknown): string {
  const env = renderEnv(rendererEnv)
  const index = env.excalidrawSequence++
  const fitLabel = escapeAttr(t('preview.excalidraw_fit'))
  const fullscreenLabel = escapeAttr(t('preview.excalidraw_fullscreen'))
  const libraryLabel = escapeAttr(t('preview.excalidraw_library'))
  return [
    `<div class="excalidraw-block loading"${line} data-excalidraw="${escapeAttr(encodeDataValue(token.content))}" data-excalidraw-index="${index}" aria-busy="true">`,
    `<div class="excalidraw-block-head">`,
    `<span class="excalidraw-block-title">${escapeHtml(t('preview.excalidraw'))}</span>`,
    `<span class="excalidraw-block-actions">`,
    `<button type="button" class="excalidraw-block-btn" data-excalidraw-library aria-label="${libraryLabel}" title="${libraryLabel}"></button>`,
    `<button type="button" class="excalidraw-block-btn" data-excalidraw-fit aria-label="${fitLabel}" title="${fitLabel}"></button>`,
    `<button type="button" class="excalidraw-block-btn" data-excalidraw-fullscreen aria-label="${fullscreenLabel}" title="${fullscreenLabel}"></button>`,
    `</span>`,
    `</div>`,
    `<div class="excalidraw-block-placeholder" data-excalidraw-placeholder>${escapeHtml(t('preview.excalidraw_loading'))}</div>`,
    `</div>`,
  ].join('')
}

function renderKanbanBlock(token: Token, line: string, rendererEnv: unknown): string {
  const env = renderEnv(rendererEnv)
  env.hasKanban = true
  const index = env.kanbanSequence++
  const body = token.content
  const mode = detectKanbanMode(body)
  const fullscreenLabel = escapeAttr(t('preview.kanban_fullscreen'))
  return [
    `<div class="kanban-block loading"${line} data-kanban="${escapeAttr(encodeDataValue(body))}" data-kanban-index="${index}" aria-busy="true">`,
    `<div class="kanban-block-head">`,
    `<span class="kanban-block-title">${escapeHtml(t('preview.kanban'))}</span>`,
    `<span class="kanban-block-mode">${escapeHtml(mode)}</span>`,
    `<span class="kanban-block-actions">`,
    `<button type="button" class="kanban-block-btn" data-kanban-fullscreen aria-label="${fullscreenLabel}" title="${fullscreenLabel}"></button>`,
    `</span>`,
    `</div>`,
    `<div class="kanban-block-placeholder" data-kanban-placeholder>${escapeHtml(t('preview.kanban_loading'))}</div>`,
    `</div>`,
  ].join('')
}

function renderBentoSlidesBlock(token: Token, line: string, rendererEnv: unknown): string {
  const env = renderEnv(rendererEnv)
  env.hasBentoSlides = true
  const index = env.bentoSlidesSequence++
  const body = token.content
  const mode = detectSlidesMode(body)
  const fullscreenLabel = escapeAttr(t('preview.slides_fullscreen'))
  return [
    `<div class="bento-slides-block loading"${line} data-bento-slides="${escapeAttr(encodeDataValue(body))}" data-bento-slides-index="${index}" aria-busy="true">`,
    `<div class="bento-slides-block-head">`,
    `<span class="bento-slides-block-title">${escapeHtml(t('preview.slides'))}</span>`,
    `<span class="bento-slides-block-mode">${escapeHtml(mode)}</span>`,
    `<span class="bento-slides-block-actions">`,
    `<button type="button" class="bento-slides-block-btn" data-bento-slides-fullscreen aria-label="${fullscreenLabel}" title="${fullscreenLabel}"></button>`,
    `</span>`,
    `</div>`,
    `<div class="bento-slides-block-placeholder" data-bento-slides-placeholder>${escapeHtml(t('preview.slides_loading'))}</div>`,
    `</div>`,
  ].join('')
}

export function registerFence(md: MarkdownIt): void {

  md.renderer.rules.fence = (tokens, index, _options, rendererEnv) => renderFence(md, tokens, index, rendererEnv)
}
