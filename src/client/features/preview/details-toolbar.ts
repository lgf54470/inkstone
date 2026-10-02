import { escapeHtml } from '@shared/escape'
import { formatDetailsOptions, parseDetailsOptions, type DetailsVariant } from '../../lib/markdown/renderer'
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
 * The settings toolbar for a `::: details` block: whether it starts open and which chrome it draws
 * with. The block is wrapped rather than given a header of its own — anything prepended inside a
 * `<details>` is content, and content is exactly what the block hides.
 */

/**
 * The block is the wrapper rather than the `<details>` itself: the toolbar sits above the fold, and
 * a `<details>` hides everything prepended inside it, so its header has to be a sibling.
 */
const DETAILS_BLOCK = '.details-block'

const OVERLAY_SPEC: BlockOverlaySpec = {
  block: DETAILS_BLOCK,
  panels: { settings: '.block-settings' },
  triggers: { settings: '[data-details-action="toggle-settings"]' },
  openClasses: { settings: 'is-block-settings-open' },
}

const SETTINGS_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/></svg>'

function optionButton(action: string, value: string, label: string, active: boolean): string {
  return `<button type="button" class="block-opt-btn${active ? ' is-active' : ''}" data-details-action="${action}" data-details-val="${value}" aria-pressed="${active}">${escapeHtml(label)}</button>`
}

function settingsRow(label: string, content: string): string {
  return `<div class="block-settings-row"><span class="block-settings-title">${escapeHtml(label)}</span><div class="block-settings-group">${content}</div></div>`
}

function renderChrome(block: HTMLElement, panelId: string): string {
  const label = t('preview.details_settings')
  const open = block.hasAttribute('open')
  const variant = (block.dataset.detailsVariant ?? 'default') as DetailsVariant
  const variants: Array<[DetailsVariant, string]> = [
    ['default', t('preview.details_variant_default')],
    ['card', t('preview.details_variant_card')],
    ['plain', t('preview.details_variant_plain')],
  ]
  const head = [
    `<div class="block-head">`,
    `<span class="block-head-title">${escapeHtml(t('preview.details_title'))}</span>`,
    `<span class="block-tools">`,
    `<button type="button" class="block-tool-btn" data-details-action="toggle-settings" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-expanded="false" aria-controls="${panelId}">${SETTINGS_ICON}</button>`,
    `</span>`,
    `</div>`,
  ].join('')
  const panel = [
    `<div class="block-settings" id="${panelId}" hidden>`,
    settingsRow(t('preview.details_open'), `${optionButton('set-open', 'open', t('preview.details_open_on'), open)}${optionButton('set-open', 'closed', t('preview.details_open_off'), !open)}`),
    settingsRow(t('preview.details_variant'), variants.map(([value, text]) => optionButton('set-variant', value, text, variant === value)).join('')),
    `</div>`,
  ].join('')
  return head + panel
}

/** Rewrites the container's header line; the content below it is left byte-identical. */
function updateDetailsHeader(
  content: string,
  line: number,
  update: (current: ReturnType<typeof parseDetailsOptions>) => ReturnType<typeof parseDetailsOptions>,
): string | null {
  const lines = content.split('\n')
  const raw = lines[line]
  if (raw === undefined) return null
  const indent = /^ {0,3}/.exec(raw)![0]
  const match = /^(:{3,})[ \t]+details\b(.*)$/.exec(raw.slice(indent.length))
  if (!match) return null
  const rest = formatDetailsOptions(update(parseDetailsOptions(match[2] ?? '')))
  lines[line] = `${indent}${match[1]} details${rest ? ` ${rest}` : ''}`
  return lines.join('\n')
}

function commitDetails(
  block: HTMLElement,
  content: string,
  onEdit: (next: string) => void,
  update: Parameters<typeof updateDetailsHeader>[2],
  toast: BlockToast,
): boolean {
  const line = Number(block.dataset.line)
  const next = Number.isInteger(line) && line >= 0 ? updateDetailsHeader(content, line, update) : null
  if (next === null) {
    toast({ title: t('preview.details_edit_unavailable'), tone: 'warning' })
    return true
  }
  setBlockOverlay(OVERLAY_SPEC, block, null)
  onEdit(next)
  return true
}

export function executeDetailsAction(
  action: string,
  targetEl: HTMLElement,
  content: string,
  onEdit: (next: string) => void,
  toast: BlockToast,
): boolean {
  const wrapper = targetEl.closest<HTMLElement>(DETAILS_BLOCK)
  const block = wrapper?.querySelector<HTMLElement>('.markdown-details[data-line]') ?? null
  if (!wrapper || !block) return false
  if (action === 'toggle-settings') {
    toggleBlockOverlay(OVERLAY_SPEC, wrapper, 'settings')
    return true
  }
  const value = targetEl.dataset.detailsVal ?? ''
  if (action === 'set-open')
    return commitDetails(block, content, onEdit, (current) => ({ ...current, open: value === 'open' }), toast)
  if (action === 'set-variant' && (value === 'default' || value === 'card' || value === 'plain'))
    return commitDetails(block, content, onEdit, (current) => ({ ...current, variant: value }), toast)
  return false
}

export function dismissDetailsOverlays(target: HTMLElement): void {
  dismissBlockOverlays(OVERLAY_SPEC, target)
}

export function enhanceDetailsToolbarsInRoot(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.markdown-details[data-line]').forEach((block) => {
    if (block.closest('.note-embed-body') || block.parentElement?.classList.contains('details-block')) return
    const panelId = `details-settings-${block.dataset.line ?? '0'}`
    const wrapper = document.createElement('div')
    wrapper.className = 'details-block'
    wrapper.innerHTML = renderChrome(block, panelId)
    block.replaceWith(wrapper)
    wrapper.append(block)
  })
}

/** This block family's toolbar, in the shape the shared click route and enhancer dispatch over. */
export const detailsBlockToolbar: BlockToolbarModule = {
  enhance: enhanceDetailsToolbarsInRoot,
  dismiss: dismissDetailsOverlays,
  close: (target) => closeBlockOverlayFromEvent(OVERLAY_SPEC, target),
  handle: (event, target, ctx) => {
    const button = target.closest<HTMLButtonElement>('[data-details-action]')
    if (!button) return false
    event.preventDefault()
    const editable = blockActionSource(ctx)
    if (!editable) return true
    return executeDetailsAction(
      button.dataset.detailsAction!,
      button,
      editable.source,
      (next) => ctx.api.editContent(editable.noteId, next),
      ctx.api.toast,
    )
  },
}
