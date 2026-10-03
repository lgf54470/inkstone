/**
 * Column track sizes are the one thing a panel header states that CSS cannot read out of an attribute:
 * `attr()` does not work for grid tracks, and the prose whitelist strips inline styles from rendered
 * markup. So the header writes a `data-cols-tracks` value and this runs after sanitization to hand it
 * to the stylesheet as a custom property — the same route the example split takes for its ratio.
 *
 * The value is re-checked here rather than trusted from the renderer, because this is the one place it
 * becomes a CSS declaration.
 */

const TRACK_PATTERN = /^\d{1,2}(?:\.\d{1,2})?(?:fr|%)$/
const MAX_TRACKS = 6

export function applyPanelColumnTracks(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.markdown-cols[data-cols-tracks]').forEach((grid) => {
    const tracks = (grid.dataset.colsTracks ?? '').trim().split(/\s+/)
    if (tracks.length < 2 || tracks.length > MAX_TRACKS) return
    if (!tracks.every((track) => TRACK_PATTERN.test(track))) return
    grid.style.setProperty('--panel-cols-tracks', tracks.join(' '))
  })
}
