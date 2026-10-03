import { escapeHtml } from '@shared/escape'
import { t } from '../../lib/i18n'
import type { MessageKey } from '../../lib/i18n'
import type { AlignValue, ColsGap } from '../../lib/markdown/renderer'
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
import { countColumns, setColumnCount, updateAlignHeader, updateColsHeader } from './panel-source'

/**
 * The settings toolbar for the `:::` layout blocks: an alignment block and a column block.
 *
 * Both are wrapped rather than given a header of their own, because the block's own markup is what the
 * prose stylesheet draws and inserting chrome into it would be drawn too. Every edit rewrites the note's
 * header line — the block's whole state — so the change survives a reload, a share and an export.
 */

const PANEL_BLOCK = '.panel-block'
const ALIGN_WORDS: AlignValue[] = ['left', 'center', 'right', 'justify']
const ALIGN_KEYS: Record<AlignValue, MessageKey> = {
  left: 'workspace.align_left',
  center: 'workspace.align_center',
  right: 'workspace.align_right',
  justify: 'workspace.align_justify',
}
const GAPS: Array<[ColsGap, MessageKey]> = [
  ['narrow', 'preview.panel_gap_narrow'],
  ['normal', 'preview.panel_gap_normal'],
  ['wide', 'preview.panel_gap_wide'],
]

const OVERLAY_SPEC: BlockOverlaySpec = {
  block: PANEL_BLOCK,
  panels: { settings: '.block-settings' },
  triggers: { settings: '[data-panel-action="toggle-settings"]' },
  openClasses: { settings: 'is-block-settings-open' },
}

const SETTINGS_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/></svg>'

function optionButton(action: string, value: string, label: string, active: boolean): string {
  return `<button type="button" class="block-opt-btn${active ? ' is-active' : ''}" data-panel-action="${action}" data-panel-val="${escapeAttrValue(value)}" aria-pressed="${active}">${escapeHtml(label)}</button>`
}

function escapeAttrValue(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

function settingsRow(label: string, content: string): string {
  return `<div class="block-settings-row"><span class="block-settings-title">${escapeHtml(label)}</span><div class="block-settings-group">${content}</div></div>`
}

function alignRow(current: AlignValue | null): string {
  return settingsRow(
    t('workspace.alignment'),
    ALIGN_WORDS.map((word) => optionButton('set-align', word, t(ALIGN_KEYS[word]), current === word)).join(''),
  )
}

function colsRows(block: HTMLElement): string {
  const columns = Number(block.dataset.cols) || 1
  const gap = (block.dataset.colsGap ?? 'normal') as ColsGap
  const divider = block.hasAttribute('data-cols-divider')
  return [
    settingsRow(t('preview.panel_columns'), `${optionButton('columns-remove', '', t('preview.panel_fewer'), false)}${optionButton('columns-add', '', t('preview.panel_more'), false)}<span class="block-settings-value">${columns}</span>`),
    settingsRow(t('preview.panel_gap'), GAPS.map(([value, key]) => optionButton('set-gap', value, t(key), gap === value)).join('')),
    settingsRow(t('preview.panel_divider'), `${optionButton('set-divider', 'on', t('preview.panel_divider_on'), divider)}${optionButton('set-divider', 'off', t('preview.panel_divider_off'), !divider)}`),
    alignRow((block.dataset.colsAlign ?? null) as AlignValue | null),
  ].join('')
}

function renderChrome(block: HTMLElement, panelId: string): string {
  const isCols = block.classList.contains('markdown-cols')
  const head = [
    `<div class="block-head">`,
    `<span class="block-head-title">${escapeHtml(t(isCols ? 'workspace.columns' : 'workspace.alignment'))}</span>`,
    `<span class="block-tools">`,
    `<button type="button" class="block-tool-btn" data-panel-action="toggle-settings" title="${escapeHtml(t('preview.panel_settings'))}" aria-label="${escapeHtml(t('preview.panel_settings'))}" aria-expanded="false" aria-controls="${panelId}">${SETTINGS_ICON}</button>`,
    `</span>`,
    `</div>`,
  ].join('')
  const panel = [
    `<div class="block-settings" id="${panelId}" hidden>`,
    isCols ? colsRows(block) : alignRow(block.dataset.align as AlignValue),
    `</div>`,
  ].join('')
  return head + panel
}

/** Commits one header rewrite, or tells the reader the block moved out from under the toolbar. */
function commit(
  block: HTMLElement,
  content: string,
  onEdit: (next: string) => void,
  toast: BlockToast,
  rewrite: (source: string, line: number) => string | null,
): boolean {
  const line = Number(block.dataset.line)
  const next = Number.isInteger(line) && line >= 0 ? rewrite(content, line) : null
  if (next === null) {
    toast({ title: t('preview.panel_edit_unavailable'), tone: 'warning' })
    return true
  }
  setBlockOverlay(OVERLAY_SPEC, block.closest<HTMLElement>(PANEL_BLOCK) ?? block, null)
  onEdit(next)
  return true
}

export function executePanelAction(
  action: string,
  targetEl: HTMLElement,
  content: string,
  onEdit: (next: string) => void,
  toast: BlockToast,
): boolean {
  const wrapper = targetEl.closest<HTMLElement>(PANEL_BLOCK)
  const block = wrapper?.querySelector<HTMLElement>('.markdown-align[data-line], .markdown-cols[data-line]')
  if (!wrapper || !block) return false
  if (action === 'toggle-settings') {
    toggleBlockOverlay(OVERLAY_SPEC, wrapper, 'settings')
    return true
  }
  const value = targetEl.dataset.panelVal ?? ''
  const isCols = block.classList.contains('markdown-cols')
  if (action === 'set-align') {
    if (!isCols) return commit(block, content, onEdit, toast, (source, line) => updateAlignHeader(source, line, value as AlignValue))
    return commit(block, content, onEdit, toast, (source, line) => updateColsHeader(source, line, (current) => ({ ...current, align: value as AlignValue })))
  }
  if (!isCols) return false
  if (action === 'set-gap' && GAPS.some(([gap]) => gap === value)) {
    return commit(block, content, onEdit, toast, (source, line) => updateColsHeader(source, line, (current) => ({ ...current, gap: value as ColsGap })))
  }
  if (action === 'set-divider') {
    const wanted = value === 'on'
    return commit(block, content, onEdit, toast, (source, line) => updateColsHeader(source, line, (current) => ({ ...current, divider: wanted })))
  }
  if (action === 'columns-add' || action === 'columns-remove') {
    const current = countColumns(content, Number(block.dataset.line))
    if (current === null) return commit(block, content, onEdit, toast, () => null)
    return commit(block, content, onEdit, toast, (source, line) => setColumnCount(source, line, action === 'columns-add' ? current + 1 : current - 1))
  }
  return false
}

export function dismissPanelOverlays(target: HTMLElement): void {
  dismissBlockOverlays(OVERLAY_SPEC, target)
}

export function enhancePanelToolbarsInRoot(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.markdown-align[data-line], .markdown-cols[data-line]').forEach((block) => {
    if (block.closest('.note-embed-body') || block.parentElement?.classList.contains('panel-block')) return
    const wrapper = document.createElement('div')
    wrapper.className = 'panel-block'
    wrapper.innerHTML = renderChrome(block, `panel-settings-${block.dataset.line ?? '0'}`)
    block.replaceWith(wrapper)
    wrapper.append(block)
  })
}

export const panelBlockToolbar: BlockToolbarModule = {
  enhance: enhancePanelToolbarsInRoot,
  dismiss: dismissPanelOverlays,
  close: (target) => closeBlockOverlayFromEvent(OVERLAY_SPEC, target),
  handle: (event, target, ctx) => {
    const button = target.closest<HTMLButtonElement>('[data-panel-action]')
    if (!button) return false
    event.preventDefault()
    const editable = blockActionSource(ctx)
    if (!editable) return true
    return executePanelAction(
      button.dataset.panelAction!,
      button,
      editable.source,
      (next) => ctx.api.editContent(editable.noteId, next),
      ctx.api.toast,
    )
  },
}
