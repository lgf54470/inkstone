/**
 * SSR rendering for the fence families the notes app builds full interactive
 * surfaces for (mind maps, whiteboards, kanban boards, bento slides). The blog is
 * a serialized, read-only surface — exactly the case the root app calls a
 * "snapshot channel" — so each family gets the same answer its own share/export
 * surfaces give:
 *
 * - mindmap: a placeholder the client lazily upgrades to a static SVG picture
 *   (mind-elixir is a vendor chunk, exactly like mermaid on this same page);
 * - kanban: the cards the fence describes, grouped by the active view's column;
 * - excalidraw / bento-slides: a titled frame with the scene/source behind a
 *   disclosure (their renderers need the app's React surface; even the notes
 *   app's own public share page does not mount live slides).
 *
 * A body that will not parse falls back to its source, never to an empty box.
 */
import { escapeAttr, escapeHtml } from './escape.ts'

export const MINDMAP_LANGUAGES = new Set(['mindmap', 'mind-elixir'])
const EXCALIDRAW_LANGUAGES = new Set(['excalidraw'])
const KANBAN_LANGUAGES = new Set(['kanban', 'notion-kanban', 'board'])
const SLIDES_LANGUAGES = new Set(['bento-slides', 'bento-slide', 'slides', 'ppt', 'bento'])

export type HeavyKind = 'mindmap' | 'excalidraw' | 'kanban' | 'slides'

export function heavyFenceKind(language: string): HeavyKind | null {
  if (MINDMAP_LANGUAGES.has(language)) return 'mindmap'
  if (EXCALIDRAW_LANGUAGES.has(language)) return 'excalidraw'
  if (KANBAN_LANGUAGES.has(language)) return 'kanban'
  if (SLIDES_LANGUAGES.has(language)) return 'slides'
  return null
}

function detectJsonMode(body: string): 'json' | 'outline' {
  const trimmed = body.trimStart()
  return trimmed.startsWith('{') || trimmed.startsWith('[') ? 'json' : 'outline'
}

function lineCount(body: string): number {
  const trimmed = body.replace(/\n$/, '')
  return trimmed ? trimmed.split('\n').length : 0
}

/** The `theme=` annotation on a mindmap fence's info string, or null when it names none. */
export function readMindmapAnnotation(info: string): string | null {
  const match = /(?:^|\s)theme=(?:"([^"]*)"|'([^']*)'|([^\s{}]+))/i.exec(info)
  if (!match) return null
  return (match[1] ?? match[2] ?? match[3] ?? '').slice(0, 64)
}

export function renderMindmapFence(body: string, info: string): string {
  const mode = detectJsonMode(body)
  const annotation = readMindmapAnnotation(info)
  return [
    `<div class="mindmap-block loading" data-mindmap="${encodeURIComponent(body)}" data-mindmap-mode="${mode}"${annotation === null ? '' : ` data-mindmap-theme="${escapeAttr(annotation)}"`} aria-busy="true">`,
    `<div class="mindmap-block-head">`,
    `<span class="mindmap-block-title">思维导图</span>`,
    `<span class="mindmap-block-mode">${mode === 'json' ? 'JSON' : '大纲'}</span>`,
    `</div>`,
    `<div class="mindmap-block-placeholder" data-mindmap-placeholder>思维导图加载中…</div>`,
    `</div>`,
  ].join('')
}

/** The titled frame with the source behind a disclosure: what this surface shows for a block it cannot draw. */
export function sourceFrame(title: string, body: string, hint: string): string {
  const count = lineCount(body)
  return [
    `<div class="static-block" data-static-block="1">`,
    `<div class="static-block-head">`,
    `<span class="static-block-title">${escapeHtml(title)}</span>`,
    `<span class="static-block-hint">${escapeHtml(hint)}</span>`,
    `</div>`,
    `<details class="static-block-source">`,
    `<summary>查看源码${count ? `（${count} 行）` : ''}</summary>`,
    `<pre><code>${escapeHtml(body)}</code></pre>`,
    `</details>`,
    `</div>`,
  ].join('')
}

export function renderExcalidrawFence(body: string): string {
  return sourceFrame('Excalidraw 白板', body, '博客端以源码形式展示')
}

export function renderSlidesFence(body: string, mode: 'json' | 'outline'): string {
  return sourceFrame(mode === 'json' ? 'Bento 幻灯片' : 'Bento 幻灯片（大纲）', body, '博客端以源码形式展示')
}

export function renderHeavyFence(kind: HeavyKind, body: string, info: string): string {
  if (kind === 'mindmap') return renderMindmapFence(body, info)
  if (kind === 'excalidraw') return renderExcalidrawFence(body)
  if (kind === 'slides') return renderSlidesFence(body, detectJsonMode(body))
  return renderKanbanFence(body)
}

// ── Kanban snapshot ─────────────────────────────────────────────────────────
//
// A read-only board as a still list, the same shape the root app draws on its
// share/export surfaces (kanban/static.ts): grouped by the active view's group
// column, archived and deleted cards stay out, and a body that will not parse
// shows its source.

interface SnapshotItem {
  title: string
  archived: boolean
  deleted: boolean
  properties: Record<string, unknown>
}

interface SnapshotOption {
  id: string
  label: string
}

interface SnapshotColumn {
  id: string
  options: SnapshotOption[]
}

interface SnapshotBoard {
  title: string
  items: SnapshotItem[]
  groupColumn: SnapshotColumn | null
}

interface SnapshotGroup {
  key: string
  label: string
  items: SnapshotItem[]
}

const BUILTIN_GROUP_LABELS: Record<string, string> = {
  todo: '待办',
  'to do': '待办',
  in_progress: '进行中',
  'in progress': '进行中',
  done: '已完成',
}

const MAX_SNAPSHOT_CARDS = 500

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asOption(value: unknown): SnapshotOption | null {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' ? value.id : ''
  const label = typeof value.label === 'string' ? value.label : id
  if (!id || !label) return null
  return { id, label }
}

function asColumn(value: unknown): SnapshotColumn | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  const options = Array.isArray(value.options)
    ? value.options.map(asOption).filter((option): option is SnapshotOption => option !== null)
    : []
  return { id: value.id, options }
}

function asItem(value: unknown): SnapshotItem | null {
  if (!isRecord(value) || typeof value.title !== 'string') return null
  return {
    title: value.title,
    archived: value.archived === true,
    deleted: value.deleted === true,
    properties: isRecord(value.properties) ? value.properties : {},
  }
}

function parseJsonBoard(body: string): SnapshotBoard | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  }
  catch {
    return null
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.items)) return null
  const items = parsed.items.map(asItem).filter((item): item is SnapshotItem => item !== null)
  const columns = Array.isArray(parsed.columns)
    ? parsed.columns.map(asColumn).filter((column): column is SnapshotColumn => column !== null)
    : []
  const views = Array.isArray(parsed.views) ? parsed.views.filter(isRecord) : []
  const activeViewId = typeof parsed.activeViewId === 'string' ? parsed.activeViewId : ''
  const activeView = views.find((view) => view.id === activeViewId)
    ?? views.find((view) => view.type === 'board')
    ?? views[0]
  const groupById = typeof activeView?.groupBy === 'string' ? activeView.groupBy : 'status'
  const groupColumn = columns.find((column) => column.id === groupById)
    ?? columns.find((column) => column.id === 'status')
    ?? (groupById === 'status' ? null : { id: groupById, options: [] })
  return {
    title: typeof parsed.title === 'string' ? parsed.title : '',
    items,
    groupColumn,
  }
}

function parseOutlineProperties(rawText: string): { properties: Record<string, unknown>; cleanText: string } {
  const properties: Record<string, unknown> = {}
  for (const match of rawText.matchAll(/(?<!\\)\[([a-zA-Z0-9_\u4e00-\u9fa5]+):\s*([^\]]+)\]/g)) {
    const key = match[1]!.trim().toLowerCase()
    const val = match[2]!.trim()
    if (key === 'tags') {
      properties.tags = val.split(/[,\uFF0C]/).map((part) => part.trim()).filter(Boolean)
    }
    else if (key === 'progress') {
      const number = Number(val)
      if (Number.isFinite(number)) properties.progress = number
    }
    else {
      properties[key] = val
    }
  }
  const cleanText = rawText
    .replace(/(?<!\\)\[[a-zA-Z0-9_\u4e00-\u9fa5]+:\s*([^\]]+)\]/g, '')
    .replace(/\\([\[\]])/g, '$1')
    .trim()
  return { properties, cleanText }
}

/** The outline form: `## 分组` headings and `- [x] 卡片 [priority: high]` lines. */
function parseOutlineBoard(body: string): SnapshotBoard {
  const options: SnapshotOption[] = []
  const items: SnapshotItem[] = []
  let currentGroup = 'Default'
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const heading = /^#{1,4}\s+(.+)$/.exec(line)
    if (heading) {
      currentGroup = heading[1]!.trim()
      if (!options.some((option) => option.label === currentGroup)) {
        options.push({ id: `status-${options.length + 1}`, label: currentGroup })
      }
      continue
    }
    const itemMatch = /^[-*+]\s+(?:\[([ xX])\]\s+)?(.+)$/.exec(line)
    if (!itemMatch) continue
    if (!options.some((option) => option.label === currentGroup)) {
      options.push({ id: `status-${options.length + 1}`, label: currentGroup })
    }
    const current = options.find((option) => option.label === currentGroup)
    const { properties, cleanText } = parseOutlineProperties(itemMatch[2]!)
    if (current) properties.status = current.id
    if (itemMatch[1]?.toLowerCase() === 'x') properties.checked = true
    items.push({ title: cleanText || '未命名', archived: false, deleted: false, properties })
  }
  return { title: '', items, groupColumn: { id: 'status', options } }
}

function valueMatchesOption(value: unknown, optionId: string): boolean {
  if (typeof value === 'string') return value === optionId
  if (Array.isArray(value)) return value.some((entry) => entry === optionId)
  return false
}

function groupLabel(key: string, fallback: string): string {
  if (key === '__none__') return '未分组'
  return BUILTIN_GROUP_LABELS[fallback.toLowerCase()] ?? fallback
}

function snapshotGroups(board: SnapshotBoard): SnapshotGroup[] {
  const groups: SnapshotGroup[] = (board.groupColumn?.options ?? []).map((option) => ({
    key: option.id,
    label: groupLabel(option.id, option.label),
    items: [],
  }))
  const noGroup: SnapshotGroup = { key: '__none__', label: '未分组', items: [] }
  for (const item of board.items) {
    if (item.archived || item.deleted) continue
    const groupId = board.groupColumn?.id ?? 'status'
    const value = item.properties[groupId]
    const matched = groups.find((group) => valueMatchesOption(value, group.key))
    if (matched) matched.items.push(item)
    else noGroup.items.push(item)
  }
  if (noGroup.items.length > 0 || groups.length === 0) groups.unshift(noGroup)
  return groups.filter((group) => group.items.length > 0)
}

function renderSnapshot(board: SnapshotBoard): string {
  const groups = snapshotGroups(board)
  const parts = ['<div class="kanban-block" data-kanban-block><div class="kanban-snapshot" data-kanban-snapshot="1">']
  if (board.title) parts.push(`<p class="kanban-snapshot-title">${escapeHtml(board.title)}</p>`)
  if (groups.length === 0) {
    parts.push('<p class="kanban-snapshot-empty">看板中暂无卡片</p>')
  }
  else {
    parts.push('<dl class="kanban-snapshot-groups">')
    let rendered = 0
    let truncated = 0
    for (const group of groups) {
      parts.push(`<dt class="kanban-snapshot-group">${escapeHtml(group.label)}<span class="kanban-snapshot-count">${group.items.length}</span></dt>`)
      parts.push('<dd class="kanban-snapshot-group-cards"><ul class="kanban-snapshot-cards">')
      for (const item of group.items) {
        if (rendered >= MAX_SNAPSHOT_CARDS) {
          truncated += 1
          continue
        }
        parts.push(`<li class="kanban-snapshot-card">${escapeHtml(item.title)}</li>`)
        rendered += 1
      }
      parts.push('</ul></dd>')
    }
    parts.push('</dl>')
    if (truncated > 0) {
      parts.push(`<p class="kanban-snapshot-truncated">仅展示前 ${MAX_SNAPSHOT_CARDS} 张卡片，其余 ${truncated} 张请在笔记应用中查看</p>`)
    }
  }
  parts.push('</div></div>')
  return parts.join('')
}

export function renderKanbanFence(body: string): string {
  const mode = detectJsonMode(body)
  const board = mode === 'json' ? parseJsonBoard(body) : parseOutlineBoard(body)
  if (!board) return sourceFrame('看板', body, '看板源码解析失败，以源码形式展示')
  return renderSnapshot(board)
}
