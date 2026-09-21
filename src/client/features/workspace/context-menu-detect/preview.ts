import { decodeDataValue } from '../../../lib/markdown/data-attr'
import { excalidrawBody } from '../../../lib/markdown/excalidraw'
import { kanbanBody } from '../../../lib/markdown/kanban'
import { mindmapBody } from '../../../lib/markdown/mindmap'
import { slidesBody } from '../../../lib/markdown/slides'
import type { PreviewContextData } from './types'

function getSourceLine(el: HTMLElement | null): number | undefined {
  const nearest = el?.closest<HTMLElement>('[data-source-line], [data-line]')
  if (!nearest) return undefined
  const raw = nearest.dataset.sourceLine ?? nearest.dataset.line
  return raw ? parseInt(raw, 10) : undefined
}

function detectSelection(target: HTMLElement): PreviewContextData | null {
  const windowSelection = window.getSelection()
  if (!windowSelection || windowSelection.isCollapsed || windowSelection.toString().trim().length === 0) {
    return null
  }
  const sourceEl = target.closest<HTMLElement>('[data-source-line]')
  const sourceLine = sourceEl?.dataset.sourceLine ? parseInt(sourceEl.dataset.sourceLine, 10) : undefined
  return { type: 'selection', target, selectedText: windowSelection.toString(), sourceLine }
}

function detectTable(target: HTMLElement): PreviewContextData | null {
  const tableCell = target.closest<HTMLTableCellElement>('td, th')
  if (!tableCell) return null
  const tableRow = tableCell.closest('tr')
  const tableEl = tableCell.closest('table')
  if (!tableEl || !tableRow) return null
  const tbody = tableEl.querySelector('tbody')
  const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : []
  const rowIndex = tableCell.tagName.toLowerCase() === 'th' ? 0 : rows.indexOf(tableRow) + 1
  return {
    type: 'table',
    target,
    table: { rowIndex, colIndex: tableCell.cellIndex, sourceLine: getSourceLine(tableEl) },
  }
}

function detectImage(target: HTMLElement): PreviewContextData | null {
  const imgEl = target.closest<HTMLImageElement>('img')
  if (!imgEl) return null
  return { type: 'image', target, image: { src: imgEl.src, alt: imgEl.alt, sourceLine: getSourceLine(imgEl) } }
}

function detectMath(target: HTMLElement): PreviewContextData | null {
  const mathEl = target.closest<HTMLElement>('.katex, [data-math], .math')
  if (!mathEl) return null
  const texEl = mathEl.querySelector('annotation[encoding="application/x-tex"]')
  const formula = texEl?.textContent ?? mathEl.dataset.math ?? mathEl.textContent ?? ''
  const isBlock = mathEl.classList.contains('katex-display') || mathEl.tagName.toLowerCase() === 'div'
  return { type: 'math', target, math: { formula, isBlock, sourceLine: getSourceLine(mathEl) } }
}

function detectMermaid(target: HTMLElement): PreviewContextData | null {
  const mermaidEl = target.closest<HTMLElement>('.mermaid, [data-mermaid]')
  if (!mermaidEl) return null
  return { type: 'mermaid', target, mermaid: { code: mermaidEl.dataset.code ?? mermaidEl.textContent ?? '', sourceLine: getSourceLine(mermaidEl) } }
}

function detectChart(target: HTMLElement): PreviewContextData | null {
  const chartEl = target.closest<HTMLElement>('.chartjs-block, [data-chart]')
  if (!chartEl) return null
  return { type: 'chart', target, chart: { code: decodeDataValue(chartEl.dataset.chart ?? '') || chartEl.textContent || '', sourceLine: getSourceLine(chartEl) } }
}

function detectMindmap(target: HTMLElement): PreviewContextData | null {
  const mindmapEl = target.closest<HTMLElement>('[data-mindmap], .mindmap-block')
  if (!mindmapEl) return null
  return { type: 'mindmap', target, mindmap: { code: mindmapBody(mindmapEl), sourceLine: getSourceLine(mindmapEl) } }
}

function detectExcalidraw(target: HTMLElement): PreviewContextData | null {
  const boardEl = target.closest<HTMLElement>('[data-excalidraw], .excalidraw-block')
  if (!boardEl) return null
  return { type: 'excalidraw', target, excalidraw: { code: excalidrawBody(boardEl), sourceLine: getSourceLine(boardEl) } }
}

function detectKanban(target: HTMLElement): PreviewContextData | null {
  const kanbanEl = target.closest<HTMLElement>('[data-kanban], .kanban-block')
  if (!kanbanEl) return null
  return { type: 'kanban', target, kanban: { code: kanbanBody(kanbanEl), sourceLine: getSourceLine(kanbanEl) } }
}

function detectSlides(target: HTMLElement): PreviewContextData | null {
  const slidesEl = target.closest<HTMLElement>('[data-bento-slides], .bento-slides-block')
  if (!slidesEl) return null
  return { type: 'slides', target, slides: { code: slidesBody(slidesEl), sourceLine: getSourceLine(slidesEl) } }
}

function detectCodeBlock(target: HTMLElement): PreviewContextData | null {
  const codeEl = target.closest<HTMLElement>('pre code, pre')
  if (!codeEl) return null
  const pre = codeEl.tagName.toLowerCase() === 'pre' ? codeEl : codeEl.closest('pre')
  const classAttr = (codeEl.getAttribute('class') ?? '') + ' ' + (pre?.getAttribute('class') ?? '')
  const langMatch = /language-([a-zA-Z0-9_-]+)/.exec(classAttr)
  return {
    type: 'codeblock',
    target,
    codeBlock: { language: langMatch ? langMatch[1]! : '', code: pre?.textContent ?? '', sourceLine: getSourceLine(pre) },
  }
}

function detectWikiLink(target: HTMLElement): PreviewContextData | null {
  const wikiEl = target.closest<HTMLElement>('[data-wikilink]')
  if (!wikiEl) return null
  return { type: 'wikilink', target, wikiLink: { noteTitle: wikiEl.dataset.wikilink ?? wikiEl.textContent ?? '', sourceLine: getSourceLine(wikiEl) } }
}

function detectLink(target: HTMLElement): PreviewContextData | null {
  const linkEl = target.closest<HTMLAnchorElement>('a[href]')
  if (!linkEl || linkEl.hasAttribute('data-wikilink')) return null
  return { type: 'link', target, link: { text: linkEl.textContent ?? '', url: linkEl.href, sourceLine: getSourceLine(linkEl) } }
}

function detectFrontmatter(target: HTMLElement): PreviewContextData | null {
  const frontmatterEl = target.closest<HTMLElement>('[data-frontmatter], .note-properties-editor')
  if (!frontmatterEl) return null
  return { type: 'frontmatter', target, sourceLine: 0 }
}

function detectTask(target: HTMLElement): PreviewContextData | null {
  const taskItem = target.closest<HTMLElement>('li.task-list-item, li:has(input[type="checkbox"])')
  if (!taskItem) return null
  const checkbox = taskItem.querySelector<HTMLInputElement>('input[type="checkbox"]')
  return { type: 'task', target, task: { checked: checkbox ? checkbox.checked : false, taskLine: getSourceLine(taskItem) } }
}

const DETECTORS: Array<(target: HTMLElement) => PreviewContextData | null> = [
  detectSelection,
  detectTable,
  detectImage,
  detectMath,
  detectMermaid,
  detectChart,
  detectMindmap,
  detectExcalidraw,
  detectKanban,
  detectSlides,
  detectCodeBlock,
  detectWikiLink,
  detectLink,
  detectFrontmatter,
  detectTask,
]

export function detectPreviewContext(target: HTMLElement): PreviewContextData {
  for (const detect of DETECTORS) {
    const ctx = detect(target)
    if (ctx) return ctx
  }
  return { type: 'empty', target, sourceLine: getSourceLine(target) }
}