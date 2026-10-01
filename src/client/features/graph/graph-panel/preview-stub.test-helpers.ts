import { createElement } from 'react'

/**
 * Selection is the one interaction that can make the panel repaint itself, and a preview whose identity
 * changes on every render turns that into a loop that never returns. The stub counts those paints and
 * throws once a single selection has passed the cap, so the suite goes red instead of hanging.
 */
export const PREVIEW_RENDER_CAP = 24

export const previewProbe = { renders: 0, subscribes: 0 }

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
    WikiLinkHoverCard: ({ card }: { card: { title: string } }) => {
      previewProbe.renders++
      if (previewProbe.renders > PREVIEW_RENDER_CAP) {
        throw new Error(`one selection painted the preview ${previewProbe.renders} times`)
      }
      return createElement('div', { 'data-preview-card': card.title })
    },
  }
}
