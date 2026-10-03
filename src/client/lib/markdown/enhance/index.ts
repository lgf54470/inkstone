import { configureCodeBlockCollapsing } from './code'
import { highlightCodeBlocks } from './code'
import { applyExampleSplits } from './example-split'
import { applyPanelColumnTracks } from './panel-cols'
import { wrapZoomableImages } from './image'
import { showMathSource } from './math'
import { renderMath } from './math'
import { hydrateCachedMermaid } from './mermaid'
import { currentSignature } from './mermaid'
import { getMermaid } from './mermaid'
import { showMermaidSource } from './mermaid'
import { renderChartJs } from './chart'
import { renderStaticEcharts, showEchartsSource } from './echarts'
import { getLocale } from '../../i18n'
import { registerFenceBodies, type FenceBodies } from '../fence-bodies'
import { renderStaticMindmaps, showMindmapSourceAll, type MindmapBox } from '../mindmap'
import { renderStaticExcalidraws, showExcalidrawSourceAll } from '../excalidraw'
import { renderStaticKanbans, showKanbanSourceAll } from '../kanban'

interface EnhanceOptions {
  math: boolean
  mermaid: boolean
  dark: boolean
  codeBlockCollapseLines?: number
  /**
   * The fence bodies this markup was rendered from, registered on the root before any block is
   * drawn (P-01). A `snapshot` channel reads them — a board's cards, a map's topics — so a surface
   * that draws one must pass the set from its own `renderMarkdown` call; an empty stand-in
   * reads to the blocks as an empty fence, which is their error state. Left out only where the
   * root's own subtrees each carry a set of their own, as every page of the printed deck does.
   */
  fences?: FenceBodies
  /**
   * How this surface treats ```mindmap blocks. `live` means the caller mounts
   * them itself (the preview pane); `snapshot` draws a still image here, for
   * surfaces whose markup gets serialized or printed; omitted means the block
   * shows its source, which is what a surface that knows nothing about mind maps
   * should look like.
   */
  mindmap?: 'live' | 'snapshot'
  /**
   * How this surface treats ```excalidraw blocks, with the same three answers a mind
   * map gets: `live` where the caller mounts the boards itself, `snapshot` where the
   * markup gets serialized or printed, and omitted where the block shows its scene.
   */
  excalidraw?: 'live' | 'snapshot'
  /**
   * How this surface treats ```kanban blocks. A board is a React root that needs a host to
   * write its edits back to, so only the preview pane runs one: `live` means the caller mounts
   * the boards itself, `snapshot` draws the cards as a still list for markup that gets
   * serialized or printed, and omitted leaves the block showing its fence.
   */
  kanban?: 'live' | 'snapshot'
  /**
   * The box a `snapshot` mind map is drawn and fitted for. Surfaces that size
   * their blocks themselves (a note, a share page) leave it out; a slide passes
   * its content area, because a map drawn at the wrong size is a cropped one.
   */
  mindmapBox?: MindmapBox
  /**
   * Whether a prose image is a control that opens the lightbox. Surfaces that print or
   * serialize their markup (export, share, slides) leave it off: a button there would be
   * a control nobody can press once the markup is a document.
   */
  zoomableImages?: boolean
  /**
   * Whether charts are drawn with their entrance animation. A surface that hands the result to
   * something that reads its pixels — the printed deck, whose sheet is handed to the print pipeline
   * the moment the webfonts land, and the note export, which turns every canvas into a PNG inside
   * the tick it created them — passes `true`: chart.js animates towards its data, so a canvas read
   * while an animation runs is blank, and a resize clears it and starts another one.
   */
  instantCharts?: boolean
  /**
   * How this surface treats ```echarts blocks. A chart is a canvas the library owns, so only a
   * surface that mounts one itself (the preview pane) asks for `live`; a surface whose markup gets
   * serialized or printed asks for `snapshot`, which draws once and leaves an image; a surface that
   * names neither leaves the block showing its option.
   */
  echarts?: 'live' | 'snapshot'
  /**
   * Whether a fence's own `js` marker is honoured here. The owner's preview is the only surface that
   * runs a note's JavaScript, so a shared page, a print or an export reads such a block as one it
   * cannot draw rather than executing what only its author asked to run.
   */
  echartsScript?: boolean
}
export async function enhancePreview(root: HTMLElement, options: EnhanceOptions): Promise<void> {
  // Every block under this root resolves its fence body through the element chain, so the set has
  // to be in place before the first snapshot is drawn (P-01).
  if (options.fences)
    registerFenceBodies(root, options.fences)
  if (options.zoomableImages)
    wrapZoomableImages(root)
  applyExampleSplits(root)
  applyPanelColumnTracks(root)
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
  if (!options.excalidraw)
    showExcalidrawSourceAll(root)
  if (options.kanban === 'snapshot')
    renderStaticKanbans(root)
  else if (!options.kanban)
    showKanbanSourceAll(root)
  if (!options.echarts)
    showEchartsSource(root)
  if (!options.math)
    showMathSource(root)
  await Promise.allSettled([
    highlightCodeBlocks(root),
    options.math ? renderMath(root) : Promise.resolve(),
    root.isConnected ? renderChartJs(root, options.dark, { instant: options.instantCharts ?? false }) : Promise.resolve(),

    options.mindmap === 'snapshot' ? renderStaticMindmaps(root, { dark: options.dark, locale: getLocale(), box: options.mindmapBox }) : Promise.resolve(),
    options.excalidraw === 'snapshot' ? renderStaticExcalidraws(root, { dark: options.dark }) : Promise.resolve(),
    options.echarts === 'snapshot' ? renderStaticEcharts(root, options.dark) : Promise.resolve(),
  ])
  configureCodeBlockCollapsing(root, options.codeBlockCollapseLines ?? 24)
}
export { wrapZoomableImages } from './image'
export { applyExampleSplits } from './example-split'
export { applyPanelColumnTracks } from './panel-cols'
export { decorateCodeBlock } from './code'
export { configureCodeBlockCollapsing } from './code'
export { toggleCodeBlockCollapse } from './code'
export type { MermaidRenderHooks } from './mermaid'
export { renderPendingMermaid } from './mermaid'
export { resetMermaidNode } from './mermaid'
export { showMermaidSource } from './mermaid'
export { destroyChartInstances } from './chart'
export { renderChartJs } from './chart'
export { destroyEchartsInstances, renderEcharts, renderStaticEcharts, showEchartsSource } from './echarts'
export { invalidateMermaidTheme } from './mermaid'
