import type { BentoDoc, Slide } from './types'

/**
 * The pages the audience is handed: the show walks them and a print lays them out, in deck
 * order. A hidden page is deliberate material the author kept off the screen, so it becomes
 * neither a projector page nor a sheet of paper — and the two agree because they ask this one
 * function rather than filtering for themselves.
 *
 * A state page (`stateOf`) is deliberately NOT filtered out here yet. The format reaches such a
 * page by interacting with the one it continues, and this build has no state navigation, so
 * leaving it out would put its content somewhere no reader could get to. It stays in the flow
 * until that navigation lands; the print side of the ledger records the same decision.
 */
export function audienceSlides(doc: BentoDoc): Slide[] {
  return doc.slides.filter((slide) => !slide.hidden)
}
