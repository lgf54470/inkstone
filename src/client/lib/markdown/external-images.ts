/**
 * The one answer to "may this image load?" that the prose renderer and the board both read.
 *
 * An external image is a privacy decision, not a rendering one: a note can be shared, so an image
 * served by whoever wrote it turns every reader into a tracking pixel, which is why the app blocks
 * them until the account asks for them. The renderer asks this of every markdown image; the board
 * asks it of a cover and of an attachment preview, because those are the same kind of URL arriving
 * from the same untrusted document. A second predicate on the board's side would be a second policy
 * able to drift, so this lives here — below both — as a leaf module: `renderer/fence.ts` imports the
 * kanban module, so the board importing the renderer's entry would close a dependency cycle.
 */
export function isExternalImageUrl(src: string): boolean {
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
