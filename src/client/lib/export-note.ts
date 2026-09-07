import { escapeHtml } from '@shared/escape'
import { EXPORT_PALETTE } from './export-palette'
import { renderMarkdown } from './markdown/renderer'
import { useSession } from '../store/session'
import { resolveNoteEmbeds } from './markdown/embeds'
import {
  destroyChartInstances,
  enhancePreview,
  renderChartJs,
  renderPendingMermaid,
} from './markdown/enhance'

const KATEX_CSS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.18.1/dist/katex.min.css'

export function downloadTextFile(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportNoteAsMarkdown(note: { title: string; content: string }): void {
  const title = note.title.trim()
  const frontMatter = title ? `---\ntitle: ${JSON.stringify(title)}\n---\n\n` : ''
  downloadTextFile(`${safeFileName(title) || 'note'}.md`, `${frontMatter}${note.content}`, 'text/markdown;charset=utf-8')
}

export async function renderNoteToExportHtml(
  note: { title: string; content: string },
  language: string,
): Promise<string> {
  const rendered = renderExportHtml(note)
  const container = createExportContainer(rendered.html)
  document.body.appendChild(container)

  try {
    await runExportEnhancements(container, rendered.hasEmbeds, note)
    stripExportChrome(container)
    await embedLocalImages(container)
    return htmlDocument(note.title, container.innerHTML, language)
  } finally {
    container.remove()
  }
}

function renderExportHtml(note: { title: string; content: string }): { html: string; hasEmbeds: boolean } {
  // Respect the user's external-images choice: when blocked, exported HTML
  // shows the same placeholder as the preview instead of leaking image URLs.
  return renderMarkdown(note.content, {
    externalImages: useSession.getState().settings.preview.externalImages,
  })
}

function createExportContainer(html: string): HTMLDivElement {
  const container = document.createElement('div')
  container.className = 'ink-prose export-render-root'
  container.style.position = 'fixed'
  container.style.left = '-99999px'
  container.style.top = '0'
  container.style.width = '800px'
  container.style.visibility = 'hidden'
  container.style.pointerEvents = 'none'
  container.innerHTML = html
  return container
}

async function runExportEnhancements(container: HTMLDivElement, hasEmbeds: boolean, note: { title: string; content: string }): Promise<void> {
  if (hasEmbeds) {
    try {
      await resolveNoteEmbeds(container, {
        currentContent: note.content,
        currentTitle: note.title,
      })
    } catch (err) {
      console.warn('Failed to resolve note embeds during export:', err)
    }
  }

  try {
    await enhancePreview(container, {
      math: true,
      mermaid: true,
      dark: false,
      codeBlockCollapseLines: 0,
    })
  } catch (err) {
    console.warn('Failed to enhance preview during export:', err)
  }

  try {
    await renderPendingMermaid(container, false)
  } catch (err) {
    console.warn('Failed to render mermaid during export:', err)
  }

  try {
    await renderChartJs(container, false)
    const canvases = [...container.querySelectorAll<HTMLCanvasElement>('canvas.chartjs-canvas')]
    for (const canvas of canvases) canvasToImage(canvas)
    destroyChartInstances(container)
  } catch (err) {
    console.warn('Failed to render chart.js during export:', err)
  }
}

function canvasToImage(canvas: HTMLCanvasElement): void {
  try {
    const img = document.createElement('img')
    img.className = 'chartjs-image'
    img.src = canvas.toDataURL('image/png')
    img.alt = 'Chart'
    canvas.replaceWith(img)
  } catch (err) {
    console.warn('Failed to convert canvas to data URL:', err)
  }
}

function stripExportChrome(container: HTMLDivElement): void {
  container.querySelectorAll('.code-copy').forEach((el) => el.remove())
  container.querySelectorAll('.js-example-controls').forEach((el) => el.remove())
  container.querySelectorAll('[data-mermaid-retry]').forEach((el) => el.remove())
}

async function embedLocalImages(container: HTMLDivElement): Promise<void> {
  const images = [...container.querySelectorAll<HTMLImageElement>('img[src^="/api/files/"]')]
  await Promise.all(
    images.map(async (image) => {
      try {
        const response = await fetch(image.getAttribute('src')!, { credentials: 'same-origin' })
        if (!response.ok) return
        const dataUrl = await blobToDataUrl(await response.blob())
        if (dataUrl) image.setAttribute('src', dataUrl)
      } catch (error) {
        console.warn('[export] failed to embed remote image, keeping original URL', error)
      }
    }),
  )
}

export async function exportNoteAsHtml(note: { title: string; content: string }, language: string): Promise<void> {
  const html = await renderNoteToExportHtml(note, language)
  downloadTextFile(`${safeFileName(note.title) || 'note'}.html`, html, 'text/html;charset=utf-8')
}

export async function exportNoteAsPdf(note: { title: string; content: string }, language: string): Promise<void> {
  const html = await renderNoteToExportHtml(note, language)
  await printHtml(html)
}

async function printHtml(html: string): Promise<void> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  try {
    const win = iframe.contentWindow
    if (!win) return
    iframe.srcdoc = html
    await waitForPrintReady(iframe)
    win.focus()
    win.print()
  } finally {
    setTimeout(() => iframe.remove(), 1000)
  }
}

async function waitForPrintReady(iframe: HTMLIFrameElement): Promise<void> {
  await new Promise<void>((resolve) => {
    let isSettled = false
    const finish = () => {
      if (isSettled) return
      isSettled = true
      resolve()
    }
    iframe.addEventListener('load', () => {
      setTimeout(finish, 200)
    })
    setTimeout(finish, 3000)
  })
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(blob)
  })
}

function safeFileName(title: string): string {
  return title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export const EXPORT_CSS = `:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0 auto;
  max-width: 48rem;
  padding: 2.5rem 2rem;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 15px;
  line-height: 1.7;
  color: ${EXPORT_PALETTE.ink800};
  background: ${EXPORT_PALETTE.white};
  word-wrap: break-word;
  overflow-wrap: break-word;
}
@media print {
  body { padding: 0; max-width: none; }
  pre, table, .callout, .mermaid-block, .chartjs-block, .markdown-example, details { page-break-inside: avoid; break-inside: avoid; }
  h1, h2, h3, h4, h5, h6 { page-break-after: avoid; break-after: avoid; }
  .code-copy, .js-example-controls { display: none !important; }
  .tab-panel[hidden] { display: block !important; margin-top: 1em; border-top: 1px dashed ${EXPORT_PALETTE.ink300}; padding-top: 0.5em; }
  details { display: block !important; }
  details > * { display: block !important; }
}

h1, h2, h3, h4, h5, h6 { line-height: 1.3; margin: 1.4em 0 0.5em; font-weight: 650; color: ${EXPORT_PALETTE.ink900}; position: relative; }
h1 { font-size: 1.8em; margin-top: 1.2em; }
h2 { font-size: 1.4em; padding-bottom: 0.3em; border-bottom: 1px solid ${EXPORT_PALETTE.ink200}; }
h3 { font-size: 1.18em; }
h4 { font-size: 1.05em; }
h5, h6 { font-size: 0.95em; color: ${EXPORT_PALETTE.ink500}; }

p { margin: 0.8em 0; }
a { color: ${EXPORT_PALETTE.blue600}; text-decoration: none; }
a:hover { text-decoration: underline; }
a.heading-anchor { display: none; }
a.wikilink { color: ${EXPORT_PALETTE.ink600}; text-decoration: none; border-bottom: 1px dashed ${EXPORT_PALETTE.ink400}; }
a.block-reference { color: ${EXPORT_PALETTE.blue600}; font-size: 0.9em; }

strong { font-weight: 600; color: ${EXPORT_PALETTE.ink900}; }
del { color: ${EXPORT_PALETTE.ink400}; }
ins { text-decoration: underline; text-underline-offset: 3px; }
mark { background: ${EXPORT_PALETTE.yellow200}; padding: 0.1em 0.3em; border-radius: 3px; }
hr { border: none; border-top: 1px solid ${EXPORT_PALETTE.ink200}; margin: 2em 0; }
img { max-width: 100%; height: auto; border-radius: 6px; }

code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.88em; background: ${EXPORT_PALETTE.ink100}; border-radius: 4px; padding: 0.15em 0.35em; color: ${EXPORT_PALETTE.ink900}; }
kbd { background: ${EXPORT_PALETTE.ink50}; border: 1px solid ${EXPORT_PALETTE.ink300}; border-bottom-width: 2px; border-radius: 4px; padding: 0.1em 0.4em; font-family: ui-monospace, monospace; font-size: 0.85em; }
sub, sup { line-height: 0; font-size: 0.78em; }

.table-of-contents { margin: 1.2em 0; padding: 1em 1.2em; background: ${EXPORT_PALETTE.ink50}; border: 1px solid ${EXPORT_PALETTE.ink200}; border-radius: 8px; font-size: 0.92em; }
.toc-title { font-weight: 600; margin-bottom: 0.5em; color: ${EXPORT_PALETTE.ink700}; }
.toc-list { list-style: none; padding-left: 0; margin: 0; }
.toc-item { margin: 0.25em 0; }
.toc-level-1 { font-weight: 600; }
.toc-level-2 { padding-left: 1.2em; }
.toc-level-3 { padding-left: 2.4em; }
.toc-level-4 { padding-left: 3.6em; }
.toc-link { color: ${EXPORT_PALETTE.ink600}; }
.toc-link:hover { color: ${EXPORT_PALETTE.blue600}; }

ruby { ruby-position: over; }
rt { font-size: 0.68em; color: ${EXPORT_PALETTE.ink500}; font-weight: normal; }
abbr[title] { text-decoration: underline dotted ${EXPORT_PALETTE.ink500}; cursor: help; }
dl { margin: 1em 0; }
dt { font-weight: 600; margin-top: 0.8em; color: ${EXPORT_PALETTE.ink900}; }
dd { margin-left: 1.5em; margin-top: 0.25em; color: ${EXPORT_PALETTE.ink700}; }

.table-wrap { overflow-x: auto; margin: 1.2em 0; }
table { border-collapse: collapse; width: 100%; font-size: 0.92em; }
th, td { border: 1px solid ${EXPORT_PALETTE.ink300}; padding: 0.5em 0.8em; text-align: left; vertical-align: top; }
th { background: ${EXPORT_PALETTE.ink50}; font-weight: 600; color: ${EXPORT_PALETTE.ink700}; }
tbody tr:nth-child(even) { background: ${EXPORT_PALETTE.ink50}; }

blockquote { margin: 1em 0; padding: 0.3em 1em; border-left: 3.5px solid ${EXPORT_PALETTE.ink300}; color: ${EXPORT_PALETTE.ink600}; background: ${EXPORT_PALETTE.ink50}; border-radius: 0 6px 6px 0; }
blockquote > :first-child { margin-top: 0; }
blockquote > :last-child { margin-bottom: 0; }

.callout { border-left: 4px solid ${EXPORT_PALETTE.ink500}; border-radius: 6px; padding: 0.75em 1em; margin: 1.2em 0; background: ${EXPORT_PALETTE.ink50}; }
.callout[data-callout="note"], .callout[data-callout="info"] { border-color: ${EXPORT_PALETTE.blue500}; background: ${EXPORT_PALETTE.blue50}; }
.callout[data-callout="tip"], .callout[data-callout="success"] { border-color: ${EXPORT_PALETTE.emerald500}; background: ${EXPORT_PALETTE.emerald50}; }
.callout[data-callout="important"] { border-color: ${EXPORT_PALETTE.violet500}; background: ${EXPORT_PALETTE.violet50}; }
.callout[data-callout="warning"] { border-color: ${EXPORT_PALETTE.amber500}; background: ${EXPORT_PALETTE.amber50}; }
.callout[data-callout="caution"], .callout[data-callout="danger"], .callout[data-callout="error"] { border-color: ${EXPORT_PALETTE.red500}; background: ${EXPORT_PALETTE.red50}; }
.callout-title { font-weight: 600; margin-bottom: 0.35em; color: ${EXPORT_PALETTE.ink900}; }
.callout-content > :first-child { margin-top: 0; }
.callout-content > :last-child { margin-bottom: 0; }

ul, ol { padding-left: 1.6em; margin: 0.6em 0; }
li { margin: 0.25em 0; }
.contains-task-list { list-style: none; padding-left: 0.2em; }
.task-list-item { list-style: none; display: flex; align-items: flex-start; gap: 0.45em; margin: 0.3em 0; }
.task-list-item input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border: 1.5px solid ${EXPORT_PALETTE.ink400};
  border-radius: 4px;
  margin: 0.25em 0.35em 0 0;
  position: relative;
  flex-shrink: 0;
  display: inline-grid;
  place-items: center;
  background: ${EXPORT_PALETTE.white};
}
.task-list-item input[type="checkbox"]:checked {
  background: ${EXPORT_PALETTE.blue600};
  border-color: ${EXPORT_PALETTE.blue600};
}
.task-list-item input[type="checkbox"]:checked::after {
  content: '';
  width: 4px;
  height: 8px;
  border: solid ${EXPORT_PALETTE.white};
  border-width: 0 2px 2px 0;
  transform: rotate(45deg) translate(-1px, -1px);
}
.task-status-done .task-label { text-decoration: line-through; color: ${EXPORT_PALETTE.ink400}; }
.task-status-in-progress input[type="checkbox"] { border-color: ${EXPORT_PALETTE.blue600}; }
.task-status-in-progress input[type="checkbox"]::after {
  content: '';
  position: absolute;
  left: 3px; right: 3px; top: 6px; height: 2px;
  background: ${EXPORT_PALETTE.blue600};
  border-radius: 1px;
}
.task-status-cancelled input[type="checkbox"] { border-color: ${EXPORT_PALETTE.ink400}; background: ${EXPORT_PALETTE.ink100}; }
.task-status-cancelled input[type="checkbox"]::after {
  content: '';
  position: absolute;
  left: 3px; right: 3px; top: 6px; height: 2px;
  background: ${EXPORT_PALETTE.ink400};
}
.task-status-cancelled .task-label { text-decoration: line-through; color: ${EXPORT_PALETTE.ink400}; }
.task-status-question input[type="checkbox"] { border-color: ${EXPORT_PALETTE.amber500}; }
.task-status-question input[type="checkbox"]::after {
  content: '?';
  font-size: 11px;
  font-weight: 700;
  color: ${EXPORT_PALETTE.amber500};
  line-height: 1;
}
.task-status-important input[type="checkbox"] { border-color: ${EXPORT_PALETTE.red500}; }
.task-status-important input[type="checkbox"]::after {
  content: '!';
  font-size: 11px;
  font-weight: 700;
  color: ${EXPORT_PALETTE.red500};
  line-height: 1;
}

details { margin: 1em 0; padding: 0.7em 1em; border: 1px solid ${EXPORT_PALETTE.ink200}; border-radius: 8px; background: ${EXPORT_PALETTE.ink50}; }
summary { cursor: pointer; font-weight: 600; color: ${EXPORT_PALETTE.ink700}; }
details[open] summary { margin-bottom: 0.5em; }

.markdown-tabs { margin: 1.2em 0; border: 1px solid ${EXPORT_PALETTE.ink200}; border-radius: 8px; overflow: hidden; background: ${EXPORT_PALETTE.white}; }
.tab-list { display: flex; flex-wrap: wrap; background: ${EXPORT_PALETTE.ink50}; border-bottom: 1px solid ${EXPORT_PALETTE.ink200}; padding: 0.25em 0.4em 0; gap: 0.25em; }
.tab-list button {
  background: transparent;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  padding: 0.4em 0.8em;
  font-size: 0.85em;
  font-weight: 500;
  color: ${EXPORT_PALETTE.ink500};
  cursor: pointer;
}
.tab-list button[aria-selected="true"] {
  background: ${EXPORT_PALETTE.white};
  border-color: ${EXPORT_PALETTE.ink200};
  color: ${EXPORT_PALETTE.ink900};
  font-weight: 600;
}
.tab-panel { padding: 1em; }

.code-block { margin: 1.2em 0; border-radius: 8px; border: 1px solid ${EXPORT_PALETTE.ink700}; background: ${EXPORT_PALETTE.ink900}; color: ${EXPORT_PALETTE.ink200}; overflow: hidden; }
.code-block-head { display: flex; justify-content: space-between; align-items: center; padding: 0.45em 0.9em; background: ${EXPORT_PALETTE.whiteOverlay5}; border-bottom: 1px solid ${EXPORT_PALETTE.whiteOverlay8}; font-size: 0.78em; color: ${EXPORT_PALETTE.ink400}; font-family: ui-monospace, monospace; }
.code-title { font-weight: 500; }
.code-lang { text-transform: uppercase; opacity: 0.7; }
.code-copy { display: none !important; }
.code-block pre { margin: 0; padding: 0.9em 1.1em; background: transparent; border: none; overflow-x: auto; line-height: 1.6; }
.code-block pre code { background: transparent; padding: 0; font-size: 0.85em; color: inherit; }

.token.comment, .token.prolog, .token.doctype, .token.cdata { color: ${EXPORT_PALETTE.ink500}; font-style: italic; }
.token.punctuation { color: ${EXPORT_PALETTE.ink400}; }
.token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol { color: ${EXPORT_PALETTE.rose500}; }
.token.selector, .token.attr-name, .token.string, .token.char, .token.builtin { color: ${EXPORT_PALETTE.emerald500}; }
.token.operator, .token.entity, .token.url { color: ${EXPORT_PALETTE.sky400}; }
.token.atrule, .token.attr-value, .token.keyword { color: ${EXPORT_PALETTE.indigo400}; }
.token.function, .token.class-name { color: ${EXPORT_PALETTE.amber400}; }
.token.regex, .token.important, .token.variable { color: ${EXPORT_PALETTE.orange500}; }

.markdown-example { margin: 1.2em 0; border: 1px solid ${EXPORT_PALETTE.ink200}; border-radius: 8px; overflow: hidden; background: ${EXPORT_PALETTE.white}; }
.markdown-example-head { display: flex; justify-content: space-between; align-items: center; padding: 0.45em 0.9em; background: ${EXPORT_PALETTE.ink50}; border-bottom: 1px solid ${EXPORT_PALETTE.ink200}; font-size: 0.82em; font-weight: 600; color: ${EXPORT_PALETTE.ink600}; }
.markdown-example-grid { display: grid; grid-template-columns: 1fr 1fr; }
.markdown-example-grid.js-example-grid { grid-template-columns: 1fr; }
.markdown-example-grid.js-example-grid .markdown-example-preview { border-right: 0; }
.markdown-example-preview { padding: 1em; border-right: 1px solid ${EXPORT_PALETTE.ink200}; background: ${EXPORT_PALETTE.white}; }
.markdown-example-source { background: ${EXPORT_PALETTE.ink900}; overflow-x: auto; }
.markdown-example-source .code-block { margin: 0; border: none; border-radius: 0; }
.js-example-controls { display: none !important; }
.js-example-badge { display: inline-block; padding: 0.1em 0.4em; background: ${EXPORT_PALETTE.amber500}; color: ${EXPORT_PALETTE.white}; border-radius: 4px; font-size: 0.75em; font-weight: 700; margin-right: 0.5em; }
.js-example-output { padding: 0.9em; background: ${EXPORT_PALETTE.ink50}; border-top: 1px solid ${EXPORT_PALETTE.ink200}; font-size: 0.88em; }
.js-example-output-head { font-size: 0.78em; font-weight: 600; color: ${EXPORT_PALETTE.ink500}; margin-bottom: 0.4em; }

.mermaid-block { margin: 1.4em 0; padding: 1em; border: 1px solid ${EXPORT_PALETTE.ink200}; border-radius: 8px; background: ${EXPORT_PALETTE.ink50}; display: flex; justify-content: center; overflow-x: auto; }
.mermaid-block svg { max-width: 100%; height: auto; }
.chartjs-block { margin: 1.4em 0; padding: 1em; border: 1px solid ${EXPORT_PALETTE.ink200}; border-radius: 8px; background: ${EXPORT_PALETTE.ink50}; display: flex; justify-content: center; overflow-x: auto; }
.chartjs-image { max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 4px; }

.note-embed { margin: 1em 0; border: 1px solid ${EXPORT_PALETTE.ink200}; border-radius: 8px; overflow: hidden; background: ${EXPORT_PALETTE.white}; }
.note-embed-head { display: block; padding: 0.4em 0.8em; background: ${EXPORT_PALETTE.ink50}; border-bottom: 1px solid ${EXPORT_PALETTE.ink200}; font-size: 0.82em; font-weight: 600; color: ${EXPORT_PALETTE.ink600}; }
.note-embed-body { padding: 0.9em; }
.inline-tag { display: inline-block; padding: 0.05em 0.4em; background: ${EXPORT_PALETTE.sky100}; color: ${EXPORT_PALETTE.sky700}; border-radius: 4px; font-size: 0.88em; text-decoration: none; }
.frontmatter-properties { margin: 1em 0; padding: 0.6em 0.9em; background: ${EXPORT_PALETTE.ink50}; border: 1px solid ${EXPORT_PALETTE.ink200}; border-radius: 8px; font-size: 0.85em; }
.frontmatter-row { display: flex; gap: 1em; margin: 0.25em 0; }
.frontmatter-row dt { min-width: 80px; color: ${EXPORT_PALETTE.ink500}; margin: 0; }
.frontmatter-row dd { margin: 0; color: ${EXPORT_PALETTE.ink900}; }

.footnote-ref { font-size: 0.8em; }
.footnotes { font-size: 0.88em; color: ${EXPORT_PALETTE.ink500}; border-top: 1px solid ${EXPORT_PALETTE.ink200}; margin-top: 2em; padding-top: 1em; }
.footnotes-sep { display: none; }
.footnote-backref { text-decoration: none; margin-left: 0.3em; }`

const EXPORT_SCRIPT = `document.querySelectorAll('.tab-list button').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var wrap = btn.closest('.markdown-tabs');
    var idx = btn.dataset.tabButton;
    wrap.querySelectorAll('.tab-list button').forEach(function(b) {
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    wrap.querySelectorAll('.tab-panel').forEach(function(p) {
      p.hidden = p.dataset.tabPanel !== idx;
    });
  });
});`

function htmlDocument(title: string, bodyHtml: string, language: string): string {
  const safeTitle = escapeHtml(title)
  return `<!DOCTYPE html>
<html lang="${escapeAttr(language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<link rel="stylesheet" href="${KATEX_CSS_URL}" crossorigin="anonymous">
<style>
${EXPORT_CSS}
</style>
</head>
<body>
${safeTitle ? `<h1>${safeTitle}</h1>` : ''}
${bodyHtml}
<script>
${EXPORT_SCRIPT}
</script>
</body>
</html>`
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;')
}
