import { memo, useEffect } from 'react'
import { t } from '../../../i18n'
import type { SlideElement } from '../types'

/**
 * The frame a deck gets when this build cannot draw one of its elements: a newer element
 * type, or a shape whose geometry does not parse. It exists because the alternative — the
 * empty box this replaced — is the one failure nobody can act on: the deck looks finished,
 * the element is simply missing from the picture, and by the time anyone notices the file has
 * been written back without a clue. The type name is shown rather than translated, so a
 * person can search for it, and the console line gives the same fact to whoever is reading.
 */
export const UnsupportedElement = memo(function UnsupportedElement({
  el,
  reason,
}: {
  el: SlideElement
  reason?: string
}) {
  useEffect(() => {
    console.warn(`[inkstone] slides: unsupported element type "${el.type}" (id ${el.id})`)
  }, [el.id, el.type])

  return (
    <div
      data-slide-unsupported={el.type}
      className='flex size-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded border border-dashed border-[var(--border-subtle)] px-2 text-center text-xs text-[var(--text-tertiary)]'
    >
      <span className='font-medium'>{t('slides.element_unsupported')}</span>
      <span className='truncate opacity-70'>{reason || el.type}</span>
    </div>
  )
})
