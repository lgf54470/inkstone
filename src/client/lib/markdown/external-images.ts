/**
 * The one answer to "does this URL leave this origin?" that the prose renderer and the board both read.
 *
 * An external image is a privacy decision, not a rendering one: a note can be shared, so an image
 * served by whoever wrote it turns every reader into a tracking pixel, which is why the app blocks
 * them until the account asks for them. The renderer asks this of every markdown image; the board
 * asks it of a cover and of an attachment preview, because those are the same kind of URL arriving
 * from the same untrusted document. A second predicate on the board's side would be a second policy
 * able to drift, so this lives here — below both — as a leaf module: `renderer/fence.ts` imports the
 * kanban module, so the board importing the renderer's entry would close a dependency cycle.
 *
 * The same answer decides what an attachment link may do: `download` is ignored for a URL on another
 * origin, so a link wearing it would navigate the app's own tab away instead of saving a file.
 */
export function isCrossOriginUrl(src: string): boolean {
  if (!/^https?:/i.test(src))
    return false
  try {
    const base = typeof location === 'undefined' ? 'http://localhost/' : location.href
    const origin = typeof location === 'undefined' ? 'http://localhost/' : location.origin
    return new URL(src, base).origin !== origin
  }
  catch {
    return false
  }
}
