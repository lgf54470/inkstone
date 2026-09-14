import { configureCodeBlockCollapsing } from './code'
import { highlightCodeBlocks } from './code'
import { wrapZoomableImages } from './image'
import { showMathSource } from './math'
import { renderMath } from './math'
import { hydrateCachedMermaid } from './mermaid'
import { currentSignature } from './mermaid'
import { getMermaid } from './mermaid'
import { showMermaidSource } from './mermaid'
import { renderChartJs } from './chart'
import { getLocale } from '../../i18n'
import { renderStaticMindmaps, showMindmapSourceAll } from '../mindmap'

interface EnhanceOptions {
  math: boolean
  mermaid: boolean
  dark: boolean
  codeBlockCollapseLines?: number
  /**
   * How this surface treats ```mindmap blocks. `live` means the caller mounts
   * them itself (the preview pane); `snapshot` draws a still image here, for
   * surfaces whose markup gets serialized or printed; omitted means the block
   * shows its source, which is what a surface that knows nothing about mind maps
   * should look like.
   */
  mindmap?: 'live' | 'snapshot'
  /**
   * Whether a prose image is a control that opens the lightbox. Surfaces that print or
   * serialize their markup (export, share, slides) leave it off: a button there would be
   * a control nobody can press once the markup is a document.
   */
  zoomableImages?: boolean
}
export async function enhancePreview(root: HTMLElement, options: EnhanceOptions): Promise<void> {
  if (options.zoomableImages)
    wrapZoomableImages(root)
  if (options.mermaid) {
    hydrateCachedMermaid(root, options.dark)
    const hasPendingDiagram = [...root.querySelectorAll<HTMLElement>('[data-mermaid]')].some((node) => node.dataset.rendered !== currentSignature(node, options.dark))
    if (hasPendingDiagram)
      // Pre-warm is best-effort; the on-demand loader retries when a diagram renders.
      void getMermaid().catch(() => { })
  }
  else {
    showMermaidSource(root)
  }
  if (!options.mindmap)
    showMindmapSourceAll(root)
  if (!options.math)
    showMathSource(root)
  await Promise.allSettled([
    highlightCodeBlocks(root),
    options.math ? renderMath(root) : Promise.resolve(),
    root.isConnected ? renderChartJs(root, options.dark) : Promise.resolve(),
    options.mindmap === 'snapshot' ? renderStaticMindmaps(root, { dark: options.dark, locale: getLocale() }) : Promise.resolve(),
  ])
  configureCodeBlockCollapsing(root, options.codeBlockCollapseLines ?? 24)
}
export { wrapZoomableImages } from './image'
export { decorateCodeBlock } from './code'
export { configureCodeBlockCollapsing } from './code'
export { toggleCodeBlockCollapse } from './code'
export type { MermaidRenderHooks } from './mermaid'
export { renderPendingMermaid } from './mermaid'
export { resetMermaidNode } from './mermaid'
export { destroyChartInstances } from './chart'
export { renderChartJs } from './chart'
export { invalidateMermaidTheme } from './mermaid'
