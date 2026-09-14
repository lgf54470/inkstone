import { useEffect, useState } from 'react'
import { useSession } from '../../store/session'
import { resolveNoteEmbeds } from '../../lib/markdown/embeds'
import { enhancePreview } from '../../lib/markdown/enhance'
import { readSlideHtml, rememberSlideHtml, renderSlideSource, slideCacheKey } from './slide-html'
import type { StageMetrics } from './slide-stage'

// Renders the enhanced markup for one slide off-DOM and caches it, so the canvas and
// the slide list — and the idle preflight pass — all read the same prepared html per
// content fingerprint, theme and slide. A cache hit is left alone: re-enhancing an
// already prepared slide is what makes diagrams flash back to their placeholders.
export function useSlideHtml(options: {
  open: boolean
  deck: string[]
  index: number
  fingerprint: string
  content: string
  noteTitle: string
  dark: boolean
  metrics: StageMetrics
}): void {
  const { open, deck, index, fingerprint, content, noteTitle, dark, metrics } = options
  const preview = useSession((s) => s.settings.preview)
  const [, setTick] = useState(0)
  const contentWidth = metrics.contentWidth
  const contentHeight = metrics.contentHeight
  useEffect(() => {
    if (!open) return
    const key = slideCacheKey({ fingerprint, dark, index, contentWidth, contentHeight })
    if (readSlideHtml(key)) return
    let cancelled = false
    const rendered = renderSlideSource(deck[index] ?? '', preview.externalImages)
    rememberSlideHtml(key, rendered.html)
    setTick((tick) => tick + 1)
    const staging = document.createElement('div')
    staging.innerHTML = rendered.html
    const prepare = async () => {
      if (rendered.hasEmbeds) {
        await resolveNoteEmbeds(staging, { currentContent: content, currentTitle: noteTitle, isCurrent: () => !cancelled })
      }
      await enhancePreview(staging, {
        math: preview.math,
        mermaid: preview.mermaid,
        mindmap: 'snapshot',
        dark,
        codeBlockCollapseLines: 0,
        // A mind map is drawn for a box, not for wherever the block happens to sit:
        // the enhancement runs off-DOM, where nothing has a size to measure.
        mindmapBox: { width: contentWidth, height: contentHeight },
      })
      if (cancelled) return
      rememberSlideHtml(key, staging.innerHTML)
      setTick((tick) => tick + 1)
    }
    void prepare()
    return () => {
      cancelled = true
    }
  }, [open, deck, index, fingerprint, content, noteTitle, dark, contentWidth, contentHeight, preview.externalImages, preview.math, preview.mermaid])
}
