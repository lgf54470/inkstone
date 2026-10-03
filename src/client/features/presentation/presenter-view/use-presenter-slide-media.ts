import { useEffect, type RefObject } from 'react'
import { destroyChartInstances, enhancePreview, renderPendingMermaid } from '../../../lib/markdown/enhance'
import type { FenceBodies } from '../../../lib/markdown/fence-bodies'
import { useSession } from '../../../store/session'
import type { StageMetrics } from '../slide-stage'

/**
 * The presenter reads the slide the room reads, so a diagram, a formula, a chart or a board has to
 * arrive as a picture in this document too. The channel carries markdown rather than rendered pages,
 * so the enhancement runs here — the same chain the projector and the printed deck run, with the
 * board and map channels set to `snapshot` because a presenter's pane is a display, not an editor.
 *
 * `fences` is the set this markup was rendered from: a snapshot reads its content out of it, so a
 * slide whose bodies were left behind draws empty fences rather than its board (P-01).
 */
export function usePresenterSlideMedia(options: {
  hostRef: RefObject<HTMLElement | null>
  html: string
  fences: FenceBodies
  dark: boolean
  metrics: StageMetrics
}): void {
  const { hostRef, html, fences, dark, metrics } = options
  const preview = useSession((s) => s.settings.preview)
  const contentWidth = metrics.contentWidth
  const contentHeight = metrics.contentHeight

  useEffect(() => {
    const host = hostRef.current
    if (!host || !html) return
    let cancelled = false
    const draw = async () => {
      await enhancePreview(host, {
        math: preview.math,
        mermaid: preview.mermaid,
        mindmap: 'snapshot',
        excalidraw: 'snapshot',
        // The presenter reads the same page the room reads, board layout included (N-36).
        kanban: 'board',
        slides: 'snapshot',
        fences,
        dark,
        codeBlockCollapseLines: 0,
        mindmapBox: { width: contentWidth, height: contentHeight },
      })
      if (cancelled) return
      await renderPendingMermaid(host, dark)
    }
    void draw().catch((error: unknown) => {
      console.warn('[inkstone] presenter slide rendering failed', error)
    })
    return () => {
      cancelled = true
      destroyChartInstances(host)
    }
  }, [hostRef, html, fences, dark, preview.math, preview.mermaid, contentWidth, contentHeight])
}
