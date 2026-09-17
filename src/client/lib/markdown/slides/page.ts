export interface PageSize {
  width: number
  height: number
}

/** The page a deck gets when its body names no size of its own: the format's 16:9 default. */
export const DEFAULT_PAGE_SIZE: PageSize = { width: 1280, height: 720 }

/**
 * The one scale a surface needs. Geometry is authored in absolute pixels of the page, so
 * a thumbnail, a card in a note and a projector all draw the same numbers behind a
 * different scale — none of them may assume the default page, because a deck that names
 * its own size would then be cropped (a 4:3 deck into a 16:9 frame) or stretched.
 */
export function fitPageScale(page: PageSize, box: PageSize): number {
  return Math.min(box.width / page.width, box.height / page.height)
}
