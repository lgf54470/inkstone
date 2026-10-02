import { escapeHtml } from '@shared/escape'
import { formatTableOptions, parseTableOptions, type TableDensity, type TableFrames } from '../../lib/markdown/renderer'
import { t } from '../../lib/i18n'
import {
  blockActionSource,
  closeBlockOverlayFromEvent,
  dismissBlockOverlays,
  setBlockOverlay,
  toggleBlockOverlay,
  type BlockOverlaySpec,
  type BlockToolbarModule,
  type BlockToast,
} from './block-overlay'

/**
 * The settings toolbar for a `::: table` block: cell density, stripes and borders. A markdown table
 * has no info string of its own, so the container's header line is the block's state and every
 * action here rewrites exactly that line.
 */

const TABLE_BLOCK = '.markdown-table[data-line]'

const OVERLAY_SPEC: BlockOverlaySpec = {
  block: TABLE_BLOCK,
  panels: { settings: '.block-settings' },
  triggers: { settings: '[data-table-action="toggle-settings"]' },
  openClasses: { settings: 'is-block-settings-open' },
}

const SETTINGS_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/></svg>'

function optionButton(action: string, value: string, label: string, active: boolean): string {
  return `<button type="button" class="block-opt-btn${active ? ' is-active' : ''}" data-table-action="${action}" data-table-val="${value}" aria-pressed="${active}">${escapeHtml(label)}</button>`
}

function settingsRow(label: string, content: string): string {
  return `<div class="block-settings-row"><span class="block-settings-title">${escapeHtml(label)}</span><div class="block-settings-group">${content}</div></div>`
}

function renderHeadHtml(panelId: string): string {
  const label = t('preview.table_settings')
  return [
    `<div class="block-head">`,
    `<span class="block-head-title">${escapeHtml(t('preview.table_title'))}</span>`,
    `<span class="block-tools">`,
    `<button type="button" class="block-tool-btn" data-table-action="toggle-settings" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-expanded="false" aria-controls="${panelId}">${SETTINGS_ICON}</button>`,
    `</span>`,
    `</div>`,
  ].join('')
}

function renderPanelHtml(block: HTMLElement, panelId: string): string {
  const density = (block.dataset.tableDensity ?? 'cozy') as TableDensity
  const frames = (block.dataset.tableFrames ?? 'all') as TableFrames
  const zebra = block.dataset.tableZebra === 'true'
  return [
    `<div class="block-settings" id="${panelId}" hidden>`,
    settingsRow(t('preview.table_density'), `${optionButton('set-density', 'cozy', t('preview.table_density_cozy'), density === 'cozy')}${optionButton('set-density', 'compact', t('preview.table_density_compact'), density === 'compact')}`),
    settingsRow(t('preview.table_zebra'), `${optionButton('toggle-zebra', 'on', t('preview.table_zebra_on'), zebra)}${optionButton('toggle-zebra', 'off', t('preview.table_zebra_off'), !zebra)}`),
    settingsRow(t('preview.table_frames'), `${optionButton('set-frames', 'all', t('preview.table_frames_all'), frames === 'all')}${optionButton('set-frames', 'rows', t('preview.table_frames_rows'), frames === 'rows')}${optionButton('set-frames', 'none', t('preview.table_frames_none'), frames === 'none')}`),
    `</div>`,
  ].join('')
}

/** Rewrites the container's header line, leaving the table below it untouched. */
function updateTableHeader(
  content: string,
  line: number,
  update: (current: ReturnType<typeof parseTableOptions>) => ReturnType<typeof parseTableOptions>,
): string | null {
  const lines = content.split('\n')
  const raw = lines[line]
  if (raw === undefined) return null
  const indent = /^ {0,3}/.exec(raw)![0]
  const match = /^(:{3,})[ \t]+table\b(.*)$/.exec(raw.slice(indent.length))
  if (!match) return null
  const tokens = formatTableOptions(update(parseTableOptions(match[2] ?? '')))
  lines[line] = `${indent}${match[1]} table${tokens ? ` ${tokens}` : ''}`
  return lines.join('\n')
}

function commitTable(
  block: HTMLElement,
  content: string,
  onEdit: (next: string) => void,
  update: Parameters<typeof updateTableHeader>[2],
  toast: BlockToast,
): boolean {
  const line = Number(block.dataset.line)
  const next = Number.isInteger(line) && line >= 0 ? updateTableHeader(content, line, update) : null
  if (next === null) {
    toast({ title: t('preview.table_edit_unavailable'), tone: 'warning' })
    return true
  }
  setBlockOverlay(OVERLAY_SPEC, block, null)
  onEdit(next)
  return true
}

export function executeTableAction(
  action: string,
  targetEl: HTMLElement,
  content: string,
  onEdit: (next: string) => void,
  toast: BlockToast,
): boolean {
  const block = targetEl.closest<HTMLElement>(TABLE_BLOCK)
  if (!block) return false
  if (action === 'toggle-settings') {
    toggleBlockOverlay(OVERLAY_SPEC, block, 'settings')
    return true
  }
  const value = targetEl.dataset.tableVal ?? ''
  if (action === 'set-density' && (value === 'cozy' || value === 'compact'))
    return commitTable(block, content, onEdit, (current) => ({ ...current, density: value }), toast)
  if (action === 'toggle-zebra')
    return commitTable(block, content, onEdit, (current) => ({ ...current, zebra: value === 'on' }), toast)
  if (action === 'set-frames' && (value === 'all' || value === 'rows' || value === 'none'))
    return commitTable(block, content, onEdit, (current) => ({ ...current, frames: value }), toast)
  return false
}

export function dismissTableOverlays(target: HTMLElement): void {
  dismissBlockOverlays(OVERLAY_SPEC, target)
}

export function enhanceTableToolbarsInRoot(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(TABLE_BLOCK).forEach((block) => {
    if (block.closest('.note-embed-body') || block.querySelector(':scope > .block-head')) return
    const panelId = `table-settings-${block.dataset.line ?? '0'}`
    const wrapper = document.createElement('div')
    wrapper.innerHTML = `${renderHeadHtml(panelId)}${renderPanelHtml(block, panelId)}`
    block.prepend(...Array.from(wrapper.children))
  })
}

/** This block family's toolbar, in the shape the shared click route and enhancer dispatch over. */
export const tableBlockToolbar: BlockToolbarModule = {
  enhance: enhanceTableToolbarsInRoot,
  dismiss: dismissTableOverlays,
  close: (target) => closeBlockOverlayFromEvent(OVERLAY_SPEC, target),
  handle: (event, target, ctx) => {
    const button = target.closest<HTMLButtonElement>('[data-table-action]')
    if (!button) return false
    event.preventDefault()
    const editable = blockActionSource(ctx)
    if (!editable) return true
    return executeTableAction(
      button.dataset.tableAction!,
      button,
      editable.source,
      (next) => ctx.api.editContent(editable.noteId, next),
      ctx.api.toast,
    )
  },
}
