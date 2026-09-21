/**
 * The document the preview commits, and the pass that produces it.
 *
 * A preview commit is markup plus the fence bodies it was rendered from (P-01), and the two are only
 * meaningful together: a block reads its board out of the set that travelled with its markup, so
 * handing on a string whose set has moved on would paint a stale board. Keeping the pair — and the
 * rule about when a fresh preparation is a new document — in one place is what lets the hook that
 * owns the state stay about state.
 */
import type { PreviewSettings } from '@shared/types/settings'
import { cloneFenceBodies, sameFenceBodies, type FenceBodies } from '../../lib/markdown/fence-bodies'
import { enhancePreview } from '../../lib/markdown/enhance'
import { resolveNoteEmbeds } from '../../lib/markdown/embeds'
import type { renderMarkdown } from '../../lib/markdown/renderer'
import { capturePreviewInteractionState, restorePreviewInteractionState } from './preview-state'
import { enhanceTablesInRoot } from './table-interactive'

/** One render of a note: the markup to draw, and the bodies its rich blocks read themselves from. */
export interface PreparedDocument {
  html: string
  fences: FenceBodies
}

export async function prepareStagedHtml(opts: {
  staging: HTMLDivElement
  rendered: ReturnType<typeof renderMarkdown>
  debounced: string
  embedContextTitle: string
  preview: PreviewSettings
  theme: string
  host: HTMLDivElement | null
  isCurrent: () => boolean
}): Promise<PreparedDocument | null> {
  const { staging, rendered, debounced, embedContextTitle, preview, theme, host, isCurrent } = opts
  // Resolving an embed renders another document into this one, appending its fence bodies to the set — on
  // a clone, because the render's own set must stay what `renderMarkdown` returned. Otherwise every pass
  // over the same note would start from the last pass's embeds, numbering bodies nobody ever reads.
  const fences = cloneFenceBodies(rendered.fences)
  if (rendered.hasEmbeds) {
    await resolveNoteEmbeds(staging, {
      currentContent: debounced,
      currentTitle: embedContextTitle,
      fences,
      isCurrent,
    })
  }
  await enhancePreview(staging, {
    math: preview.math,
    mermaid: preview.mermaid,
    // Mind maps are mounted live, from the committed markup, by useMindmapBlocks.
    mindmap: 'live',
    // Whiteboards are mounted live, from the committed markup, by useExcalidrawBlocks.
    excalidraw: 'live',
    // Boards too: useKanbanBlocks mounts them from the committed markup and writes edits back to the fence.
    kanban: 'live',
    // What the blocks in this markup were rendered from; the host gets the same set when it takes the markup.
    fences,
    // The preview is where the lightbox lives, so this is the surface whose images are controls.
    zoomableImages: true,
    dark: theme === 'dark',
    codeBlockCollapseLines: preview.codeBlockCollapse ? preview.codeBlockCollapseLines : 0,
  })
  enhanceTablesInRoot(staging)
  if (!isCurrent()) return null
  restorePreviewInteractionState(staging, capturePreviewInteractionState(host))
  return { html: staging.innerHTML, fences }
}

/**
 * The document to commit, or `null` when this preparation drew the one already on screen.
 *
 * A preparation always hands back a freshly built set, so its identity says nothing; the mounted blocks
 * are keyed on the set's identity, so an unchanged document has to keep committing the set they already
 * read from. And the reverse matters just as much: a fence-body edit leaves the rendered string
 * identical, so comparing the string alone would leave a board showing what the note no longer holds.
 */
export function nextCommittedDocument(previous: PreparedDocument, prepared: PreparedDocument): PreparedDocument | null {
  const sameBodies = sameFenceBodies(previous.fences, prepared.fences)
  if (prepared.html === previous.html && sameBodies) return null
  return { html: prepared.html, fences: sameBodies ? previous.fences : prepared.fences }
}
