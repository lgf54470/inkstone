import { useEffect, useState } from 'react'
import { useSession } from '../../store/session'
import { resolveNoteEmbeds } from '../../lib/markdown/embeds'
import { enhancePreview } from '../../lib/markdown/enhance'
import { markSlideFailed, readSlideHtml, rememberSlideHtml, renderSlideSource, slideCacheKey, slideMarkup, type SlideRender } from './slide-html'
import type { StageMetrics } from './slide-stage'

// One staged page, put through the enhancement chain and written back to the cache. The channels are
// named at the call rather than assembled elsewhere because every surface that enhances markdown owes
// a ```kanban fence an answer — `tests/kanban-render-channel.test.ts` reads this call, not a helper.
async function prepareStagedSlide(source: {
  key: string
  staging: HTMLDivElement
  rendered: SlideRender
  content: string
  noteTitle: string
  math: boolean
  mermaid: boolean
  dark: boolean
  contentWidth: number
  contentHeight: number
  isCurrent: () => boolean
}): Promise<void> {
  const { key, staging, rendered, content, noteTitle, math, mermaid, dark, contentWidth, contentHeight, isCurrent } = source
  if (rendered.hasEmbeds) {
    await resolveNoteEmbeds(staging, { currentContent: content, currentTitle: noteTitle, fences: rendered.fences, isCurrent })
  }
  await enhancePreview(staging, {
    math,
    mermaid,
    mindmap: 'snapshot',
    excalidraw: 'snapshot',
    // The staged markup is cached and re-serialized into a page, so a board travels as its cards.
    kanban: 'snapshot',
    // The bodies these blocks were rendered from. A snapshot draws from the fence body, and the body
    // no longer rides in the markup that carries it (P-01). The cache keeps this same set beside the
    // string, because the printed deck runs this draw over a page once more.
    fences: rendered.fences,
    dark,
    codeBlockCollapseLines: 0,
    // A mind map is drawn for a box, not for wherever the block happens to sit:
    // the enhancement runs off-DOM, where nothing has a size to measure.
    mindmapBox: { width: contentWidth, height: contentHeight },
  })
  if (!isCurrent()) return
  rememberSlideHtml(key, { html: staging.innerHTML, fences: rendered.fences, layout: rendered.layout, prepared: true })
}

// Renders the enhanced markup for one slide off-DOM and caches it, so the canvas and
// the slide list — and the idle preflight pass — all read the same prepared html per
// content fingerprint, theme and slide. A prepared page is left alone: re-enhancing an
// already prepared slide is what makes diagrams flash back to their placeholders.
// The return says whether this page's enhancement failed: the text is still there and only the
// diagrams and math stayed placeholders, which the surface has to be able to say out loud.
export function useSlideHtml(options: {
  open: boolean
  deck: string[]
  hashes: string[]
  index: number
  content: string
  noteTitle: string
  dark: boolean
  metrics: StageMetrics
}): boolean {
  const { open, deck, hashes, index, content, noteTitle, dark, metrics } = options
  const preview = useSession((s) => s.settings.preview)
  const [, setTick] = useState(0)
  const contentWidth = metrics.contentWidth
  const contentHeight = metrics.contentHeight
  // Hoisted out of the effect because the caller asks the same question the preparer answers with its
  // failure: did this page's enhancement land, or did it throw and leave the plain markup behind.
  // The identity of the slide comes from the deck, which identified it once when it split (`useShowDeck`)
  // — hashing this page's text again here would be a second answer to a question already answered.
  const key = slideCacheKey({ fingerprint: hashes[index] ?? '', dark, index, contentWidth, contentHeight })
  useEffect(() => {
    if (!open) return
    // The plain render is not a finished page (see `SlideMarkup.prepared`), so an interrupted run
    // leaves the page to be drawn again — by this visit, or by the next one that asks for it.
    const staged = readSlideHtml(key)
    if (staged?.prepared || staged?.failed) return
    let cancelled = false
    const rendered = renderSlideSource(deck[index] ?? '', preview.externalImages)
    rememberSlideHtml(key, slideMarkup(rendered))
    setTick((tick) => tick + 1)
    const staging = document.createElement('div')
    staging.innerHTML = rendered.html
    // The rejection must not vanish: it used to, and the only trace was a formula skeleton the
    // presenter had no way to tell apart from a slow show.
    prepareStagedSlide({ key, staging, rendered, content, noteTitle, math: preview.math, mermaid: preview.mermaid, dark, contentWidth, contentHeight, isCurrent: () => !cancelled })
      .then(() => { if (!cancelled) setTick((tick) => tick + 1) })
      .catch((error: unknown) => {
        if (cancelled) return
        console.warn('[inkstone] slide preparation failed', error)
        markSlideFailed(key)
        setTick((tick) => tick + 1)
      })
    return () => {
      cancelled = true
    }
    // The key is the whole input set of the preparation that is not a setting: it carries the slide's
    // own text, its index, the theme and the box it is drawn in, so everything else the effect reads
    // is pinned by it. Leaving the note's text and the deck array out is the point — an edit in
    // another slide re-splits the note and hands over a new array, and taking that as a reason to
    // start over cancelled the run on the page the presenter is actually looking at.
  }, [open, key, preview.externalImages, preview.math, preview.mermaid])
  return readSlideHtml(key)?.failed === true
}
