/**
 * Sizing a picture a person just added to a slide. The bytes themselves live in Inkstone's
 * attachment store and the slide keeps the address — the deck's own `assets` table stays
 * what it is for a deck imported from a self-contained file, where the bytes travel with it.
 */

/** A courtesy cap, so a huge file is refused before a slow upload starts; the server is still the authority. */
export const MAX_SLIDE_IMAGE_BYTES = 8 * 1024 * 1024
/** How wide a new picture lands on the page; its height follows the picture's own shape. */
export const IMAGE_BOX_MAX_WIDTH = 480
const DEFAULT_ASPECT = 4 / 3

export function imageTooLarge(bytes: number): boolean {
  return bytes > MAX_SLIDE_IMAGE_BYTES
}

export function imageBoxForAspect(width?: number, height?: number): { w: number; h: number } {
  if (!width || !height || width <= 0 || height <= 0) {
    return { w: IMAGE_BOX_MAX_WIDTH, h: Math.round(IMAGE_BOX_MAX_WIDTH / DEFAULT_ASPECT) }
  }
  const scale = Math.min(1, IMAGE_BOX_MAX_WIDTH / width, IMAGE_BOX_MAX_WIDTH / height)
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) }
}

/**
 * The picture's own pixel size, or null when the browser will not say — no decoder, or a
 * format it refuses to touch. Null is not a failure: the caller falls back to a default box,
 * which crops the picture rather than distorting it.
 */
export async function decodeImageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== 'function') return null
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(blob)
    return { width: bitmap.width, height: bitmap.height }
  } catch {
    // Best effort by design: the size only picks the starting box, so an undecodable file is
    // answered by the default box instead of by an error the person cannot act on.
    return null
  } finally {
    try {
      bitmap?.close()
    } catch {
      // Best-effort bitmap release; a failed close only leaks until GC reclaims it.
    }
  }
}
