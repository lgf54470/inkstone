/**
 * Column track sizes are the one thing a `::: cols` header states that a stylesheet cannot read out of
 * an attribute (`attr()` does not work for grid tracks), and the blog's prose whitelist lets only the
 * KaTeX elements carry a `style` (see ./markdown/sanitize.ts) — so the server emits `data-cols-tracks`
 * and this hands it to ./styles/prose/panels.css as a custom property, the same route ./example-splits.ts
 * takes for the example grid ratio. Without it the grid still lays out, with equal tracks.
 *
 * The value is re-checked here rather than trusted from the renderer, because this is the one place it
 * becomes a CSS declaration. Self-contained on purpose: it belongs to the post page's client chunk,
 * which must not pull in the SSR markdown barrel.
 */

const TRACK_PATTERN = /^\d{1,2}(?:\.\d{1,2})?(?:fr|%)$/
const MAX_TRACKS = 6

export function applyPanelColumnTracks(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.markdown-cols[data-cols-tracks]').forEach((grid) => {
    const tracks = (grid.dataset.colsTracks ?? '').trim().split(/\s+/)
    if (tracks.length < 2 || tracks.length > MAX_TRACKS) return
    if (!tracks.every((track) => TRACK_PATTERN.test(track))) return
    grid.style.setProperty('--panel-cols-tracks', tracks.join(' '))
  })
}
