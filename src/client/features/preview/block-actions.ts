import { codeBlockToolbar } from './code-block-toolbar'
import { exampleToolbar } from './example-layout'
import { graphBlockToolbar } from './graph-block-toolbar'
import { tableBlockToolbar } from './table-toolbar'
import type { BlockActionContext, BlockToolbarModule } from './block-overlay'

/**
 * The preview's single entry point for every block settings toolbar: one enhancer and one click
 * route for all families, so adding a family costs no new branch in the preview's handlers.
 *
 * Each family owns its markup, its action vocabulary and its overlays; the shared part — which panel
 * is open, Escape, closing on a click elsewhere — lives in `block-overlay`.
 */
const MODULES: BlockToolbarModule[] = [exampleToolbar, codeBlockToolbar, graphBlockToolbar, tableBlockToolbar]

export function enhanceBlockToolbars(root: HTMLElement): void {
  MODULES.forEach((module) => module.enhance(root))
}

/** A click anywhere in the surface closes whatever overlay was left open, whichever family owns it. */
export function handleBlockToolbarClick(event: { preventDefault: () => void }, target: HTMLElement, ctx: BlockActionContext): boolean {
  MODULES.forEach((module) => module.dismiss(target))
  return MODULES.some((module) => module.handle(event, target, ctx))
}

/** Escape closes the innermost open block overlay and returns the trigger that should regain focus. */
export function closeBlockToolbarOverlay(target: HTMLElement): HTMLButtonElement | null {
  for (const module of MODULES) {
    const trigger = module.close(target)
    if (trigger) return trigger
  }
  return null
}
