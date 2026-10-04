/**
 * A deck of slides as a still, for every surface that serializes or prints its markup.
 *
 * The live deck is an editor: it needs a host that mounts it and a fence to write back to. A slide,
 * a printed page, a PNG export, a hover card and a shared note have neither, and until now the block
 * sat there reading "Loading slides…" forever — a promise nothing in those surfaces could keep
 * (N-38). What it draws instead is the same card grid the projector's canvas falls back to, so the
 * export and the show agree about what a deck looks like when nobody is editing it.
 */
import { parseSlidesBody } from './body'
import type { Slide } from './types'
import { markSlidesReady, showSlidesError, slidesBlocks, slidesBody, slidesPlaceholder } from './view'

/** The first two pieces of text on a slide, minus its own title, as one line of the card. */
function slideSnippet(slide: Slide): string {
  const title = slide.title?.trim() ?? ''
  return slide.elements
    .filter((element) => element.type === 'text')
    .map((element) => element.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((text) => text !== '' && text !== title)
    .slice(0, 2)
    .join(' · ')
}

function slideCard(slide: Slide): HTMLElement {
  const card = document.createElement('div')
  card.className =
    'bento-slides-fallback-card border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-[var(--sp-2)] rounded-[var(--radius-sm)] flex flex-col gap-[var(--sp-1)]'
  if (slide.title) {
    const title = document.createElement('div')
    title.className = 'font-semibold text-[length:var(--text-14)] text-[var(--text-primary)] truncate'
    title.textContent = slide.title
    card.append(title)
  }
  const snippet = slideSnippet(slide)
  if (snippet) {
    const text = document.createElement('div')
    text.className = 'text-[length:var(--text-12)] text-[var(--text-secondary)] line-clamp-2'
    text.textContent = snippet
    card.append(text)
  }
  return card
}

function drawStill(block: HTMLElement, slides: Slide[]): void {
  const placeholder = slidesPlaceholder(block) ?? block
  const grid = document.createElement('div')
  grid.className =
    'bento-slides-fallback-grid grid grid-cols-2 gap-[var(--sp-2)] p-[var(--sp-2)] bg-[var(--bg-inset)] rounded-[var(--radius-md)]'
  for (const slide of slides) grid.append(slideCard(slide))
  placeholder.replaceChildren(grid)
}

/**
 * Draws every slides block in `root` as its still deck, and says whether it drew anything — the
 * surface that measures a slide has to know the page changed under it.
 */
export function renderStaticSlides(root: ParentNode): boolean {
  let changed = false
  for (const block of slidesBlocks(root)) {
    if (block.classList.contains('is-ready')) continue
    const parsed = parseSlidesBody(slidesBody(block))
    if (parsed.ok) {
      drawStill(block, parsed.data.slides)
      markSlidesReady(block)
    }
    else {
      // The error state says the block was drawn and what went wrong; marking it ready afterwards
      // would take that back off again.
      showSlidesError(block, parsed.error)
    }
    changed = true
  }
  return changed
}
