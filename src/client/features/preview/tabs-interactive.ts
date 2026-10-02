import { escapeHtml } from '@shared/escape'
import { escapeAttr, isValidTabsSync } from '../../lib/markdown/renderer'
import type { TabsOptions, TabsPosition } from '../../lib/markdown/renderer'
import { t } from '../../lib/i18n'
import {
  applyTabSelection,
  directTabsButtons,
  readSyncedTabChoice,
  selectedTabIndex,
} from './markdown-tabs'
import {
  addTabToSource,
  deleteTabInSource,
  getTabsTabCount,
  renameTabInSource,
  updateTabsSourceHeader,
} from './tabs-source'

const LAYOUT_POSITIONS: TabsPosition[] = ['top', 'bottom', 'left', 'right']

// Rect with a divider sitting on the named edge: the exact placement the tab strip will take.
function layoutIcon(position: TabsPosition): string {
  const divider: Record<TabsPosition, string> = {
    top: '<path d="M3 9h18"/>',
    bottom: '<path d="M3 15h18"/>',
    left: '<path d="M9 3v18"/>',
    right: '<path d="M15 3v18"/>',
  }
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/>${divider[position]}</svg>`
}

function currentPosition(tabsEl: HTMLElement): TabsPosition {
  const explicit = tabsEl.dataset.tabsPosition
  if (explicit === 'top' || explicit === 'bottom' || explicit === 'left' || explicit === 'right') {
    return explicit
  }
  return tabsEl.dataset.tabsStyle === 'vertical' ? 'left' : 'top'
}

function positionLabel(position: TabsPosition): string {
  const labels: Record<TabsPosition, string> = {
    top: t('preview.tabs_position_top'),
    bottom: t('preview.tabs_position_bottom'),
    left: t('preview.tabs_position_left'),
    right: t('preview.tabs_position_right'),
  }
  return labels[position]
}

function renderToolbarHtml(position: TabsPosition, popoverId: string): string {
  const layoutOptions = LAYOUT_POSITIONS.map((value) => {
    const active = value === position
    return `<button type="button" class="tabs-layout-opt${active ? ' is-active' : ''}" data-tabs-action="set-option" data-tabs-set="position" data-tabs-val="${value}" title="${escapeAttr(positionLabel(value))}" aria-label="${escapeAttr(positionLabel(value))}" aria-pressed="${active}">${layoutIcon(value)}</button>`
  }).join('')
  const triggerLabel = t('preview.tabs_layout_trigger')
  return [
    `<div class="markdown-tabs-toolbar" role="toolbar" aria-label="${escapeAttr(t('preview.tabs_settings'))}">`,
    `<button type="button" class="markdown-tabs-btn is-layout-trigger" data-tabs-action="toggle-layout" title="${escapeAttr(triggerLabel)}" aria-label="${escapeAttr(triggerLabel)}" aria-haspopup="true" aria-expanded="false" aria-controls="${popoverId}">${layoutIcon(position)}</button>`,
    `<button type="button" class="markdown-tabs-btn" data-tabs-action="toggle-settings" title="${escapeAttr(t('preview.tabs_settings'))}" aria-label="${escapeAttr(t('preview.tabs_settings'))}">`,
    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/></svg>`,
    `</button>`,
    `<button type="button" class="markdown-tabs-btn" data-tabs-action="copy-tab" title="${escapeAttr(t('preview.tabs_copy_tab'))}" aria-label="${escapeAttr(t('preview.tabs_copy_tab'))}">`,
    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
    `</button>`,
    `<button type="button" class="markdown-tabs-btn" data-tabs-action="add-tab" title="${escapeAttr(t('preview.tabs_add_tab'))}" aria-label="${escapeAttr(t('preview.tabs_add_tab'))}">`,
    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
    `</button>`,
    `<div class="markdown-tabs-layout-popover" id="${popoverId}" role="group" aria-label="${escapeAttr(triggerLabel)}" hidden>${layoutOptions}</div>`,
    `</div>`,
  ].join('')
}

function optionButton(group: string, value: string, label: string, active: boolean): string {
  return `<button type="button" class="tabs-opt-btn${active ? ' is-active' : ''}" data-tabs-action="set-option" data-tabs-set="${group}" data-tabs-val="${value}" aria-pressed="${active}">${escapeHtml(label)}</button>`
}

function settingsRow(label: string, content: string, extraClass = ''): string {
  return `<div class="tabs-settings-row${extraClass ? ` ${extraClass}` : ''}"><span class="tabs-settings-title">${escapeHtml(label)}</span>${content}</div>`
}

function renderSettingsPanelHtml(
  currentVariant: string,
  currentAlign: string,
  currentPosition: TabsPosition,
  currentSync: string,
  activeTitle: string,
  tabCount: number,
): string {
  const positionGroup = LAYOUT_POSITIONS.map((value) =>
    optionButton('position', value, positionLabel(value), currentPosition === value)).join('')
  const variantGroup = [
    optionButton('variant', 'default', t('preview.tabs_variant_default'), currentVariant === 'default'),
    optionButton('variant', 'pills', t('preview.tabs_variant_pills'), currentVariant === 'pills'),
    optionButton('variant', 'cards', t('preview.tabs_variant_cards'), currentVariant === 'cards'),
    optionButton('variant', 'minimal', t('preview.tabs_variant_minimal'), currentVariant === 'minimal'),
  ].join('')
  const alignGroup = [
    optionButton('align', 'start', t('preview.tabs_align_start'), currentAlign === 'start'),
    optionButton('align', 'center', t('preview.tabs_align_center'), currentAlign === 'center'),
    optionButton('align', 'end', t('preview.tabs_align_end'), currentAlign === 'end'),
    optionButton('align', 'stretch', t('preview.tabs_align_stretch'), currentAlign === 'stretch'),
  ].join('')
  const syncFields = [
    `<div class="tabs-settings-fields">`,
    `<input type="text" class="tabs-text-input" data-tabs-sync-input maxlength="40" value="${escapeAttr(currentSync)}" placeholder="${escapeAttr(t('preview.tabs_sync_placeholder'))}" aria-label="${escapeAttr(t('preview.tabs_sync'))}">`,
    `<button type="button" class="tabs-opt-btn" data-tabs-action="set-sync">${escapeHtml(t('preview.tabs_sync_apply'))}</button>`,
    `<button type="button" class="tabs-opt-btn" data-tabs-action="clear-sync"${currentSync ? '' : ' disabled'}>${escapeHtml(t('preview.tabs_sync_clear'))}</button>`,
    `</div>`,
    `<p class="tabs-settings-hint">${escapeHtml(t('preview.tabs_sync_hint'))}</p>`,
  ].join('')
  const currentFields = [
    `<div class="tabs-settings-fields">`,
    `<input type="text" class="tabs-text-input" data-tabs-rename-input maxlength="80" value="${escapeAttr(activeTitle)}" placeholder="${escapeAttr(t('preview.tabs_rename_placeholder'))}" aria-label="${escapeAttr(t('preview.tabs_rename'))}">`,
    `<button type="button" class="tabs-opt-btn" data-tabs-action="rename-tab">${escapeHtml(t('preview.tabs_rename'))}</button>`,
    `<button type="button" class="tabs-opt-btn is-danger" data-tabs-action="delete-tab"${tabCount <= 1 ? ' disabled' : ''}>${escapeHtml(t('preview.tabs_delete'))}</button>`,
    `</div>`,
  ].join('')
  return [
    `<div class="markdown-tabs-settings-panel" hidden>`,
    `<section class="tabs-settings-section">`,
    settingsRow(t('preview.tabs_position'), `<div class="tabs-settings-btn-group">${positionGroup}</div>`),
    settingsRow(t('preview.tabs_variant'), `<div class="tabs-settings-btn-group">${variantGroup}</div>`),
    settingsRow(t('preview.tabs_align'), `<div class="tabs-settings-btn-group">${alignGroup}</div>`),
    `</section>`,
    `<section class="tabs-settings-section is-stack">`,
    settingsRow(t('preview.tabs_sync'), syncFields, 'is-column'),
    settingsRow(t('preview.tabs_current'), currentFields, 'is-column'),
    `</section>`,
    `</div>`,
  ].join('')
}

function activeTabTitle(tabsEl: HTMLElement): string {
  const buttons = directTabsButtons(tabsEl)
  return buttons.find((button) => button.getAttribute('aria-selected') === 'true')?.textContent?.trim()
    ?? buttons[0]?.textContent?.trim()
    ?? ''
}

function headerWrap(tabsEl: HTMLElement): HTMLElement | null {
  return tabsEl.querySelector<HTMLElement>(':scope > .markdown-tabs-header-wrap')
}

export function enhanceTabsInRoot(root: HTMLElement, options: { noteId?: string | null } = {}): void {
  const tabsList = root.querySelectorAll<HTMLElement>('.markdown-tabs[data-tabs]')
  tabsList.forEach((tabsEl) => {
    if (!tabsEl.dataset.line || tabsEl.querySelector(':scope > .markdown-tabs-header-wrap')) return
    const variant = tabsEl.dataset.tabsVariant || 'default'
    const align = tabsEl.dataset.tabsAlign || 'start'
    const position = currentPosition(tabsEl)
    const sync = tabsEl.dataset.tabsSync ?? ''

    restoreSyncedSelection(tabsEl, options.noteId, sync)

    const popoverId = `tabs-layout-menu-${tabsEl.dataset.line}`
    const container = document.createElement('div')
    container.className = 'markdown-tabs-header-wrap'
    container.innerHTML = `${renderToolbarHtml(position, popoverId)}${renderSettingsPanelHtml(
      variant,
      align,
      position,
      sync,
      activeTabTitle(tabsEl),
      directTabsButtons(tabsEl).length,
    )}`
    tabsEl.prepend(container)
  })
}

// Applies the choice remembered for this sync group (same note, earlier session) before the panel
// is committed; plain attribute flip only — no reveal, coordination or storage writes on staging.
function restoreSyncedSelection(tabsEl: HTMLElement, noteId: string | null | undefined, group: string): void {
  if (!group) return
  const saved = readSyncedTabChoice(noteId, group)
  if (saved === null) return
  applyTabSelection(tabsEl, saved, { reveal: false })
}

function setLayoutPopoverOpen(tabsEl: HTMLElement, open: boolean): void {
  const wrap = headerWrap(tabsEl)
  const popover = wrap?.querySelector<HTMLElement>('.markdown-tabs-layout-popover') ?? null
  const trigger = wrap?.querySelector<HTMLButtonElement>('[data-tabs-action="toggle-layout"]') ?? null
  popover?.toggleAttribute('hidden', !open)
  trigger?.setAttribute('aria-expanded', String(open))
  tabsEl.classList.toggle('is-layout-open', open)
}

function setSettingsPanelOpen(tabsEl: HTMLElement, open: boolean): void {
  const wrap = headerWrap(tabsEl)
  const panel = wrap?.querySelector<HTMLElement>('.markdown-tabs-settings-panel') ?? null
  panel?.toggleAttribute('hidden', !open)
  tabsEl.classList.toggle('is-settings-open', open)
  if (open) {
    const input = panel?.querySelector<HTMLInputElement>('[data-tabs-rename-input]')
    if (input) input.value = activeTabTitle(tabsEl)
  }
}

/** Closes a layout popover whose trigger lost to a click elsewhere in the same prose surface. */
export function dismissTabsOverlays(target: HTMLElement): void {
  const scope = target.closest<HTMLElement>('.ink-prose')
  if (!scope) return
  scope.querySelectorAll<HTMLElement>('.markdown-tabs.is-layout-open').forEach((tabsEl) => {
    const clickInside = target.closest<HTMLElement>('.markdown-tabs') === tabsEl
    if (clickInside) {
      if (target.closest('.markdown-tabs-layout-popover') || target.closest('[data-tabs-action="toggle-layout"]')) return
    }
    setLayoutPopoverOpen(tabsEl, false)
  })
}

/** Escape handler for an open layout popover; returns the trigger that should regain focus. */
export function closeLayoutPopoverFromEvent(target: HTMLElement): HTMLButtonElement | null {
  const tabsEl = target.closest<HTMLElement>('.markdown-tabs.is-layout-open')
  if (!tabsEl) return null
  setLayoutPopoverOpen(tabsEl, false)
  return headerWrap(tabsEl)?.querySelector<HTMLButtonElement>('[data-tabs-action="toggle-layout"]') ?? null
}

type ToastFn = (opts: { title: string; tone?: 'default' | 'success' | 'warning' | 'danger' }) => void

async function handleCopyTab(tabsEl: HTMLElement, toast: ToastFn): Promise<boolean> {
  const activePanel = [...tabsEl.querySelectorAll<HTMLElement>('[data-tab-panel]')].find(
    (p) => !p.hidden && p.closest('.markdown-tabs, [data-tabs]') === tabsEl,
  )
  const text = activePanel?.innerText?.trim() ?? ''
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: t('common.copied'), tone: 'success' })
    } catch {
      // clipboard access might be blocked in sandboxed or insecure environments
    }
  }
  return true
}

function handleAddTab(
  sourceLine: number,
  content: string,
  onEdit: (next: string) => void,
  toast: ToastFn,
): boolean {
  const next = addTabToSource(content, sourceLine)
  if (next !== null) {
    onEdit(next)
    toast({ title: t('preview.tabs_add_tab'), tone: 'success' })
  }
  return true
}

function handleSetOption(
  targetEl: HTMLElement,
  sourceLine: number,
  content: string,
  onEdit: (next: string) => void,
): boolean {
  const setKey = targetEl.dataset.tabsSet as 'variant' | 'align' | 'position' | undefined
  const setVal = targetEl.dataset.tabsVal
  if (!setKey || !setVal) return true
  const next = updateTabsSourceHeader(content, sourceLine, () => (
    { [setKey]: setVal } as Partial<TabsOptions>
  ))
  if (next !== null) {
    onEdit(next)
  }
  return true
}

function handleSetSync(
  tabsEl: HTMLElement,
  sourceLine: number,
  content: string,
  onEdit: (next: string) => void,
  toast: ToastFn,
): boolean {
  const input = tabsEl.querySelector<HTMLInputElement>('[data-tabs-sync-input]')
  const value = (input?.value ?? '').trim()
  if (value && !isValidTabsSync(value)) {
    toast({ title: t('preview.tabs_sync_invalid'), tone: 'warning' })
    return true
  }
  const next = updateTabsSourceHeader(content, sourceLine, () => ({ sync: value || undefined }))
  if (next !== null) {
    onEdit(next)
    toast({ title: value ? t('preview.tabs_sync_enabled') : t('preview.tabs_sync_cleared'), tone: 'success' })
  }
  return true
}

function handleClearSync(
  sourceLine: number,
  content: string,
  onEdit: (next: string) => void,
  toast: ToastFn,
): boolean {
  const next = updateTabsSourceHeader(content, sourceLine, () => ({ sync: undefined }))
  if (next !== null) {
    onEdit(next)
    toast({ title: t('preview.tabs_sync_cleared'), tone: 'success' })
  }
  return true
}

function handleRenameTab(
  tabsEl: HTMLElement,
  sourceLine: number,
  content: string,
  onEdit: (next: string) => void,
  toast: ToastFn,
): boolean {
  const input = tabsEl.querySelector<HTMLInputElement>('[data-tabs-rename-input]')
  const title = (input?.value ?? '').trim()
  if (!title) {
    toast({ title: t('preview.tabs_name_required'), tone: 'warning' })
    return true
  }
  const index = selectedTabIndex(tabsEl)
  const next = renameTabInSource(content, sourceLine, index, title)
  if (next !== null) {
    onEdit(next)
    toast({ title: t('preview.tabs_renamed'), tone: 'success' })
  } else {
    toast({ title: t('preview.tabs_edit_unavailable'), tone: 'warning' })
  }
  return true
}

function handleDeleteTab(
  tabsEl: HTMLElement,
  sourceLine: number,
  content: string,
  onEdit: (next: string) => void,
  toast: ToastFn,
): boolean {
  const count = getTabsTabCount(content, sourceLine)
  if (count === null) {
    toast({ title: t('preview.tabs_edit_unavailable'), tone: 'warning' })
    return true
  }
  if (count <= 1) {
    toast({ title: t('preview.tabs_cannot_delete_last'), tone: 'warning' })
    return true
  }
  const index = selectedTabIndex(tabsEl)
  const next = deleteTabInSource(content, sourceLine, index)
  if (next === null) {
    toast({ title: t('preview.tabs_edit_unavailable'), tone: 'warning' })
    return true
  }
  onEdit(next)
  toast({ title: t('preview.tabs_deleted'), tone: 'success' })
  return true
}

export async function executeTabsAction(
  action: string,
  targetEl: HTMLElement,
  content: string,
  onEdit: (next: string) => void,
  toast: ToastFn,
): Promise<boolean> {
  const tabsEl = targetEl.closest<HTMLElement>('.markdown-tabs[data-tabs]')
  if (!tabsEl) return false
  const sourceLineRaw = tabsEl.dataset.line
  if (sourceLineRaw === undefined) return false
  const sourceLine = parseInt(sourceLineRaw, 10)

  if (action === 'toggle-layout') {
    const willOpen = !tabsEl.classList.contains('is-layout-open')
    if (willOpen) setSettingsPanelOpen(tabsEl, false)
    setLayoutPopoverOpen(tabsEl, willOpen)
    return true
  }
  if (action === 'toggle-settings') {
    const willOpen = !tabsEl.classList.contains('is-settings-open')
    if (willOpen) setLayoutPopoverOpen(tabsEl, false)
    setSettingsPanelOpen(tabsEl, willOpen)
    return true
  }
  if (action === 'copy-tab') {
    return handleCopyTab(tabsEl, toast)
  }
  if (action === 'add-tab') {
    return handleAddTab(sourceLine, content, onEdit, toast)
  }
  if (action === 'set-option') {
    const handled = handleSetOption(targetEl, sourceLine, content, onEdit)
    // The DOM is re-rendered from source shortly; close on the live node now as well so the
    // popover never lingers over the block while the edit commits.
    setLayoutPopoverOpen(tabsEl, false)
    return handled
  }
  if (action === 'set-sync') {
    return handleSetSync(tabsEl, sourceLine, content, onEdit, toast)
  }
  if (action === 'clear-sync') {
    return handleClearSync(sourceLine, content, onEdit, toast)
  }
  if (action === 'rename-tab') {
    return handleRenameTab(tabsEl, sourceLine, content, onEdit, toast)
  }
  if (action === 'delete-tab') {
    return handleDeleteTab(tabsEl, sourceLine, content, onEdit, toast)
  }
  return false
}
