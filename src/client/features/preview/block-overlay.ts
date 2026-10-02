import { t } from '../../lib/i18n'

/**
 * The overlay state machine every block settings toolbar shares: which panel of a block is open, the
 * aria marks that say so, closing on a click elsewhere in the same prose surface, and Escape handing
 * focus back to the trigger that opened it.
 *
 * Each block brings its own panel markup and action vocabulary; only this part is common, and it is
 * here because three block families carry a toolbar. The tabs block keeps its own — it predates this
 * module and drives a tab strip rather than a panel.
 */

export type BlockToast = (opts: { title: string; tone?: 'default' | 'success' | 'warning' | 'danger' }) => void

export interface BlockOverlaySpec {
  /** The block root whose panels these are, e.g. `'.markdown-example[data-example-family]'`. */
  block: string
  /** Overlay name → panel selector inside the block. */
  panels: Record<string, string>
  /** Overlay name → the trigger that opens it, which is also where Escape returns focus. */
  triggers: Record<string, string>
  /** Overlay name → the class the block carries while that overlay is open (a CSS hook). */
  openClasses: Record<string, string>
  /** Runs after the state changes, for a panel that has to refresh what it shows. */
  onOpen?: (block: HTMLElement, overlay: string | null) => void
}

function select(block: HTMLElement, selector: string | undefined): HTMLElement | null {
  return selector ? block.querySelector<HTMLElement>(selector) : null
}

/** Which of this block's overlays is open, read back from the class the CSS hook leaves behind. */
export function openBlockOverlay(spec: BlockOverlaySpec, block: HTMLElement): string | null {
  return Object.keys(spec.panels).find((name) => {
    const openClass = spec.openClasses[name]
    return Boolean(openClass) && block.classList.contains(openClass)
  }) ?? null
}

export function setBlockOverlay(spec: BlockOverlaySpec, block: HTMLElement, overlay: string | null): void {
  for (const name of Object.keys(spec.panels)) {
    const open = name === overlay
    const panel = select(block, spec.panels[name])
    if (panel) panel.toggleAttribute('hidden', !open)
    const trigger = select(block, spec.triggers[name])
    if (trigger) trigger.setAttribute('aria-expanded', String(open))
    const openClass = spec.openClasses[name]
    if (openClass) block.classList.toggle(openClass, open)
  }
  spec.onOpen?.(block, overlay)
}

/** Opens the named overlay, or closes whatever was open when it was already the one. */
export function toggleBlockOverlay(spec: BlockOverlaySpec, block: HTMLElement, overlay: string): void {
  setBlockOverlay(spec, block, openBlockOverlay(spec, block) === overlay ? null : overlay)
}

/** Closes an overlay whose trigger lost to a click elsewhere in the same prose surface. */
export function dismissBlockOverlays(spec: BlockOverlaySpec, target: HTMLElement): void {
  const scope = target.closest<HTMLElement>('.ink-prose')
  if (!scope) return
  const panelSelectors = Object.values(spec.panels).join(',')
  scope.querySelectorAll<HTMLElement>(spec.block).forEach((block) => {
    if (!openBlockOverlay(spec, block)) return
    const inside = target.closest(spec.block) === block
      && Boolean(panelSelectors) && Boolean(target.closest(panelSelectors))
    if (!inside) setBlockOverlay(spec, block, null)
  })
}

/** Escape handler for an open overlay; returns the trigger that should regain focus. */
export function closeBlockOverlayFromEvent(spec: BlockOverlaySpec, target: HTMLElement): HTMLButtonElement | null {
  const block = target.closest<HTMLElement>(spec.block)
  if (!block) return null
  const overlay = openBlockOverlay(spec, block)
  if (!overlay) return null
  setBlockOverlay(spec, block, null)
  return (select(block, spec.triggers[overlay]) as HTMLButtonElement | null) ?? null
}

/** What a block action needs from the preview: the note, its committed text and its writers. */
export interface BlockActionContext {
  content: string
  sourceNoteId: string | null
  committedSourceRef: { current: string }
  api: { editContent: (noteId: string, next: string) => void; toast: BlockToast }
}

/**
 * The shared prologue of a toolbar action: the note to edit and the committed text to edit it
 * against, or null when there is nothing to write — no note, or a preview still catching up with
 * the editor (writing then would edit text the block was not drawn from).
 */
export function blockActionSource(ctx: BlockActionContext): { noteId: string; source: string } | null {
  const noteId = ctx.sourceNoteId
  if (!noteId) return null
  if (ctx.content !== ctx.committedSourceRef.current) {
    ctx.api.toast({ title: t('preview.the_preview_is_updating_try_again_in_a_moment'), tone: 'warning' })
    return null
  }
  return { noteId, source: ctx.committedSourceRef.current }
}

/** What one block family's toolbar offers the shared click route and the preview's enhancer. */
export interface BlockToolbarModule {
  /** Injects the toolbar into every block of this family under the root. */
  enhance: (root: HTMLElement) => void
  /** Closes this family's open overlays (a click elsewhere in the surface). */
  dismiss: (target: HTMLElement) => void
  /** The trigger to focus after Escape closed this family's overlay, or null when none was open. */
  close: (target: HTMLElement) => HTMLButtonElement | null
  /** Handles a click on one of this family's action buttons; false when the click is not one. */
  handle: (event: { preventDefault: () => void }, target: HTMLElement, ctx: BlockActionContext) => boolean
}
