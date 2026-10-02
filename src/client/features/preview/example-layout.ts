import { escapeHtml } from '@shared/escape'
import { applyFencePatchAtSource, fenceAt } from '../../lib/markdown/fence-edit'
import {
  EXAMPLE_RATIO_PRESETS,
  EXAMPLE_SPLIT_DEFAULTS,
  escapeAttr,
  exampleRatioLabel,
  formatExampleSplitInfo,
  isExampleLayout,
  parseExampleRatio,
  parseExampleSplit,
} from '../../lib/markdown/renderer'
import type { ExampleFamily, ExampleLayout, ExampleSplitOptions } from '../../lib/markdown/renderer'
import { t } from '../../lib/i18n'

/**
 * The settings toolbar for the two-panel example blocks. It is injected here rather than rendered
 * into the markup so it only exists where a note is editable — a share page or an export draws the
 * same block without controls nobody can press — and every action writes the fence's info string,
 * which is the block's only state.
 */

const LAYOUTS: ExampleLayout[] = ['lr', 'rl', 'tb', 'bt']

const EXAMPLE_LANGUAGES: Record<ExampleFamily, readonly string[]> = {
  md: ['md-example', 'markdown-example'],
  js: ['javascript-example', 'js-example'],
}

const SWAPPED_LAYOUT: Record<ExampleLayout, ExampleLayout> = { lr: 'rl', rl: 'lr', tb: 'bt', bt: 'tb' }

function layoutIcon(layout: ExampleLayout): string {
  const divider: Record<ExampleLayout, string> = {
    lr: '<path d="M10 3v18"/>',
    rl: '<path d="M14 3v18"/>',
    tb: '<path d="M3 10h18"/>',
    bt: '<path d="M3 14h18"/>',
  }
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/>${divider[layout]}</svg>`
}

const SETTINGS_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/></svg>'

function layoutLabel(layout: ExampleLayout): string {
  const labels: Record<ExampleLayout, string> = {
    lr: t('preview.example_dir_lr'),
    rl: t('preview.example_dir_rl'),
    tb: t('preview.example_dir_tb'),
    bt: t('preview.example_dir_bt'),
  }
  return labels[layout]
}

function layoutButton(layout: ExampleLayout, active: boolean): string {
  const label = escapeAttr(layoutLabel(layout))
  return `<button type="button" class="example-layout-opt${active ? ' is-active' : ''}" data-example-action="set-layout" data-example-val="${layout}" title="${label}" aria-label="${label}" aria-pressed="${active}">${layoutIcon(layout)}</button>`
}

function optionButton(action: string, value: string, label: string, active: boolean): string {
  return `<button type="button" class="example-opt-btn${active ? ' is-active' : ''}" data-example-action="${action}" data-example-val="${escapeAttr(value)}" aria-pressed="${active}">${escapeHtml(label)}</button>`
}

function ratioButtons(split: ExampleSplitOptions): string {
  const current = exampleRatioLabel(split.ratio)
  return EXAMPLE_RATIO_PRESETS
    .map((preset) => {
      const label = `${preset[0]}:${preset[1]}`
      return optionButton('set-ratio', label, label, current === label)
    })
    .join('')
}

function renderToolbarHtml(split: ExampleSplitOptions, popoverId: string): string {
  const trigger = escapeAttr(t('preview.example_layout_trigger'))
  const settings = escapeAttr(t('preview.example_settings'))
  const options = LAYOUTS.map((layout) => layoutButton(layout, layout === split.layout)).join('')
  return [
    `<div class="markdown-example-tools">`,
    `<button type="button" class="example-tool-btn is-layout-trigger" data-example-action="toggle-layout" title="${trigger}" aria-label="${trigger}" aria-haspopup="true" aria-expanded="false" aria-controls="${popoverId}">${layoutIcon(split.layout)}</button>`,
    `<button type="button" class="example-tool-btn" data-example-action="toggle-settings" title="${settings}" aria-label="${settings}" aria-expanded="false">${SETTINGS_ICON}</button>`,
    `<div class="markdown-example-layout-popover" id="${popoverId}" hidden>${options}</div>`,
    `</div>`,
  ].join('')
}

function renderSettingsHtml(family: ExampleFamily, split: ExampleSplitOptions): string {
  const hint = family === 'js' ? t('preview.example_ratio_hint_js') : t('preview.example_ratio_hint_md')
  const directions = LAYOUTS.map((layout) => layoutButton(layout, layout === split.layout)).join('')
  const swap = `<button type="button" class="example-opt-btn" data-example-action="swap">${escapeHtml(t('preview.example_swap'))}</button>`
  const ratioFields = [
    `<div class="example-settings-fields">`,
    `<input type="text" class="example-text-input" data-example-ratio-input maxlength="7" value="${escapeAttr(exampleRatioLabel(split.ratio))}" placeholder="3:7" aria-label="${escapeAttr(t('preview.example_ratio'))}">`,
    `<button type="button" class="example-opt-btn" data-example-action="apply-ratio">${escapeHtml(t('preview.example_ratio_apply'))}</button>`,
    `<button type="button" class="example-opt-btn" data-example-action="reset">${escapeHtml(t('preview.example_reset'))}</button>`,
    `</div>`,
    `<p class="example-settings-hint">${escapeHtml(hint)}</p>`,
  ].join('')
  return [
    `<div class="markdown-example-settings" hidden>`,
    `<div class="example-settings-row"><span class="example-settings-title">${escapeHtml(t('preview.example_direction'))}</span><div class="example-settings-group">${directions}${swap}</div></div>`,
    `<div class="example-settings-row"><span class="example-settings-title">${escapeHtml(t('preview.example_ratio'))}</span><div class="example-settings-group">${ratioButtons(split)}</div></div>`,
    `<div class="example-settings-row is-column"><div class="example-settings-group is-fields">${ratioFields}</div></div>`,
    `</div>`,
  ].join('')
}

function exampleFamily(block: HTMLElement): ExampleFamily {
  return block.dataset.exampleFamily === 'js' ? 'js' : 'md'
}

function exampleGrid(block: HTMLElement): HTMLElement | null {
  return block.querySelector<HTMLElement>(':scope > .markdown-example-grid')
}

function readSplit(grid: HTMLElement): ExampleSplitOptions {
  const family: ExampleFamily = grid.closest('[data-example-family="js"]') ? 'js' : 'md'
  const defaults = EXAMPLE_SPLIT_DEFAULTS[family]
  const layout = grid.dataset.exampleLayout ?? ''
  return {
    layout: isExampleLayout(layout) ? layout : defaults.layout,
    ratio: parseExampleRatio(grid.dataset.exampleRatio ?? '') ?? [defaults.ratio[0], defaults.ratio[1]],
  }
}

/** Reads the block's fence from the note itself and writes the updated options back into its info string. */
function writeSplit(
  block: HTMLElement,
  content: string,
  update: (current: ExampleSplitOptions, defaults: ExampleSplitOptions) => ExampleSplitOptions,
): string | null {
  const family = exampleFamily(block)
  const line = Number(block.dataset.line)
  if (!Number.isInteger(line) || line < 0) return null
  const languages = EXAMPLE_LANGUAGES[family]
  const fence = fenceAt(content, line, languages)
  if (fence === null) return null
  const defaults = EXAMPLE_SPLIT_DEFAULTS[family]
  const nextInfo = formatExampleSplitInfo(fence.info, update(parseExampleSplit(fence.info, defaults), defaults), defaults)
  return applyFencePatchAtSource(content, { line, body: fence.body }, { info: nextInfo }, languages)
}

export type ToastFn = (opts: { title: string; tone?: 'default' | 'success' | 'warning' | 'danger' }) => void

function commitSplit(
  block: HTMLElement,
  content: string,
  onEdit: (next: string) => void,
  update: (current: ExampleSplitOptions, defaults: ExampleSplitOptions) => ExampleSplitOptions,
  toast: ToastFn,
  done?: string,
): boolean {
  const next = writeSplit(block, content, update)
  if (next === null) {
    toast({ title: t('preview.example_edit_unavailable'), tone: 'warning' })
    return true
  }
  // The markup is rebuilt from the edited source shortly; drop the overlay on the live node now so
  // it never lingers over the block while the edit commits.
  setOverlayOpen(block, null)
  onEdit(next)
  if (done) toast({ title: done, tone: 'success' })
  return true
}

function exampleTools(block: HTMLElement): HTMLElement | null {
  return block.querySelector<HTMLElement>(':scope > .markdown-example-head .markdown-example-tools')
}

function exampleSettings(block: HTMLElement): HTMLElement | null {
  return block.querySelector<HTMLElement>(':scope > .markdown-example-settings')
}

function setOverlayOpen(block: HTMLElement, overlay: 'layout' | 'settings' | null): void {
  const tools = exampleTools(block)
  const settings = exampleSettings(block)
  tools?.querySelector<HTMLElement>('.markdown-example-layout-popover')?.toggleAttribute('hidden', overlay !== 'layout')
  settings?.toggleAttribute('hidden', overlay !== 'settings')
  tools?.querySelector<HTMLElement>('[data-example-action="toggle-layout"]')?.setAttribute('aria-expanded', String(overlay === 'layout'))
  tools?.querySelector<HTMLElement>('[data-example-action="toggle-settings"]')?.setAttribute('aria-expanded', String(overlay === 'settings'))
  block.classList.toggle('is-example-layout-open', overlay === 'layout')
  block.classList.toggle('is-example-settings-open', overlay === 'settings')
  if (overlay === 'settings') {
    const input = settings?.querySelector<HTMLInputElement>('[data-example-ratio-input]')
    const grid = exampleGrid(block)
    if (input && grid) input.value = exampleRatioLabel(readSplit(grid).ratio)
  }
}

/** Closes an overlay whose trigger lost to a click elsewhere in the same prose surface. */
export function dismissExampleOverlays(target: HTMLElement): void {
  const scope = target.closest<HTMLElement>('.ink-prose')
  if (!scope) return
  scope.querySelectorAll<HTMLElement>('.markdown-example.is-example-layout-open, .markdown-example.is-example-settings-open').forEach((block) => {
    const inside = target.closest('.markdown-example') === block && Boolean(target.closest('.markdown-example-tools, .markdown-example-settings'))
    if (!inside) setOverlayOpen(block, null)
  })
}

/** Escape handler for an open example overlay; returns the trigger that should regain focus. */
export function closeExampleOverlayFromEvent(target: HTMLElement): HTMLButtonElement | null {
  const block = target.closest<HTMLElement>('.markdown-example[data-example-family]')
  const tools = block ? exampleTools(block) : null
  if (!block || !tools) return null
  const settingsOpen = block.classList.contains('is-example-settings-open')
  if (!settingsOpen && !block.classList.contains('is-example-layout-open')) return null
  setOverlayOpen(block, null)
  const selector = settingsOpen ? '[data-example-action="toggle-settings"]' : '[data-example-action="toggle-layout"]'
  return tools.querySelector<HTMLButtonElement>(selector)
}

function handleToggle(action: string, block: HTMLElement): boolean {
  const tools = exampleTools(block)
  if (!tools) return false
  const openLayout = action === 'toggle-layout' && !block.classList.contains('is-example-layout-open')
  const openSettings = action === 'toggle-settings' && !block.classList.contains('is-example-settings-open')
  setOverlayOpen(block, openLayout ? 'layout' : openSettings ? 'settings' : null)
  return true
}

function handleApplyRatio(block: HTMLElement, content: string, onEdit: (next: string) => void, toast: ToastFn): boolean {
  const input = block.querySelector<HTMLInputElement>('[data-example-ratio-input]')
  const ratio = parseExampleRatio(input?.value ?? '')
  if (!ratio) {
    toast({ title: t('preview.example_ratio_invalid'), tone: 'warning' })
    return true
  }
  const done = t('preview.example_ratio_applied')
  return commitSplit(block, content, onEdit, (current) => ({ ...current, ratio }), toast, done)
}

function handleSetRatio(
  value: string,
  block: HTMLElement,
  content: string,
  onEdit: (next: string) => void,
  toast: ToastFn,
): boolean {
  const ratio = parseExampleRatio(value)
  if (!ratio) return true
  return commitSplit(block, content, onEdit, (current) => ({ ...current, ratio }), toast, t('preview.example_ratio_applied'))
}

function handleSetLayout(
  value: string,
  block: HTMLElement,
  content: string,
  onEdit: (next: string) => void,
  toast: ToastFn,
): boolean {
  if (!isExampleLayout(value)) return true
  return commitSplit(block, content, onEdit, (current) => ({ ...current, layout: value }), toast)
}

export function executeExampleLayoutAction(
  action: string,
  targetEl: HTMLElement,
  content: string,
  onEdit: (next: string) => void,
  toast: ToastFn,
): boolean {
  const block = targetEl.closest<HTMLElement>('.markdown-example[data-example-family]')
  if (!block) return false
  if (action === 'toggle-layout' || action === 'toggle-settings') return handleToggle(action, block)
  if (action === 'swap')
    return commitSplit(block, content, onEdit, (current) => ({ ...current, layout: SWAPPED_LAYOUT[current.layout] }), toast)
  if (action === 'reset')
    return commitSplit(block, content, onEdit, (_current, defaults) => ({ ...defaults }), toast, t('preview.example_reset_done'))
  if (action === 'set-ratio') return handleSetRatio(targetEl.dataset.exampleVal ?? '', block, content, onEdit, toast)
  if (action === 'apply-ratio') return handleApplyRatio(block, content, onEdit, toast)
  if (action === 'set-layout') return handleSetLayout(targetEl.dataset.exampleVal ?? '', block, content, onEdit, toast)
  return false
}

/** What the click route needs from the preview: the note, its committed text and its writers. */
export interface ExampleActionContext {
  content: string
  sourceNoteId: string | null
  committedSourceRef: { current: string }
  api: { editContent: (noteId: string, next: string) => void; toast: ToastFn }
}

/**
 * Click entry point for the injected toolbar, dismissal included so the caller only has to route
 * every click here: a click outside an open overlay closes it even when it asks for nothing else.
 */
export function handleExampleClick(event: { preventDefault: () => void }, target: HTMLElement, ctx: ExampleActionContext): boolean {
  dismissExampleOverlays(target)
  const button = target.closest<HTMLButtonElement>('[data-example-action]')
  if (!button) return false
  event.preventDefault()
  const noteId = ctx.sourceNoteId
  if (!noteId) return false
  if (ctx.content !== ctx.committedSourceRef.current) {
    ctx.api.toast({ title: t('preview.the_preview_is_updating_try_again_in_a_moment'), tone: 'warning' })
    return true
  }
  const committed = ctx.committedSourceRef.current
  return executeExampleLayoutAction(button.dataset.exampleAction!, button, committed, (next) => ctx.api.editContent(noteId, next), ctx.api.toast)
}

export function enhanceExampleLayoutsInRoot(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.markdown-example[data-example-family][data-line]').forEach((block) => {
    if (block.closest('.note-embed-body') || exampleTools(block)) return
    const head = block.querySelector<HTMLElement>(':scope > .markdown-example-head')
    const grid = exampleGrid(block)
    if (!head || !grid) return
    const family = exampleFamily(block)
    const split = readSplit(grid)
    const line = block.dataset.line ?? '0'
    const tools = document.createElement('div')
    tools.innerHTML = renderToolbarHtml(split, `example-layout-menu-${family}-${line}`)
    const toolbar = tools.firstElementChild ?? tools
    const controls = head.querySelector<HTMLElement>('.js-example-controls')
    if (controls) controls.prepend(toolbar)
    else head.append(toolbar)
    const settings = document.createElement('div')
    settings.innerHTML = renderSettingsHtml(family, split)
    head.insertAdjacentElement('afterend', settings.firstElementChild ?? settings)
  })
}
