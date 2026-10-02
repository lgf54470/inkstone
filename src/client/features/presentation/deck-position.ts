import { t } from '../../lib/i18n'

/** Where a running show is: which slide of the deck, and which page of that slide. `index` and `subPage`
 * are zero-based, `count` and `pageCount` are the totals they are read against.
 *
 * Every surface that writes a deck position out goes through the two functions below. The pill, the
 * corner chip and the slide list used to each build their own — four spellings of one state, two of
 * which were numbers sitting side by side that a reader could not tell apart. */
export interface DeckPosition {
  index: number
  count: number
  subPage: number
  pageCount: number
}

/** The digits a speaker reads off the screen: `3 / 14`, and `3 / 14 · 2/4` when the slide spans pages.
 * The sub-page rides inside the same string rather than beside it: a second fraction next to the first
 * is what made the two unreadable, and a divider the reader already knows keeps them apart. */
export function formatDeckPosition({ index, count, subPage, pageCount }: DeckPosition): string {
  if (count <= 0) return ''
  const position = `${index + 1} / ${count}`
  return pageCount > 1 ? `${position} · ${subPage + 1}/${pageCount}` : position
}

/** The same position as a sentence — what the one live region announces, and what the thumbnails are
 * named by. Both numbers are named in words so a reader hears which slide and which page, not `3 14`. */
export function describeDeckPosition({ index, count, subPage, pageCount }: DeckPosition): string {
  if (count <= 0) return ''
  if (pageCount > 1) {
    return t('workspace.presentation_slide_page_number', {
      value0: index + 1,
      value1: count,
      value2: subPage + 1,
      value3: pageCount,
    })
  }
  return t('workspace.presentation_slide_number', { value0: index + 1, value1: count })
}
