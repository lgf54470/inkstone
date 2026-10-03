import { createElement } from 'react'

/**
 * Selection is the one interaction that can make the panel repaint itself, and a preview whose identity
 * changes on every render turns that into a loop that never returns. The stub counts those paints and
 * throws once a single selection has passed the cap, so the suite goes red instead of hanging.
 */
export const PREVIEW_RENDER_CAP = 24

/** `anchor` is the element the panel tells the card to hang from, so a case can read where the card is. */
export const previewProbe = { renders: 0, subscribes: 0, dark: null as boolean | null, anchor: null as HTMLElement | null }

export function previewStubModule(): Record<string, unknown> {
  return {
    getLinkHoverTarget: () => null,
    subscribeLinkHoverTarget: () => {
      previewProbe.subscribes++
      if (previewProbe.subscribes > PREVIEW_RENDER_CAP) {
        throw new Error(`the panel re-subscribed to link hovers ${previewProbe.subscribes} times without new data`)
      }
      return () => {}
    },
    WikiLinkHoverCard: ({ card, dark }: { card: { title: string, anchor: HTMLElement }, dark: boolean }) => {
      previewProbe.renders++
      previewProbe.dark = dark
      previewProbe.anchor = card.anchor
      if (previewProbe.renders > PREVIEW_RENDER_CAP) {
        throw new Error(`one selection painted the preview ${previewProbe.renders} times`)
      }
      return createElement('div', { 'data-preview-card': card.title })
    },
  }
}
