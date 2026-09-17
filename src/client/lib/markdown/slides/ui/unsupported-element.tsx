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
/**
 * The frame an element gets when its bytes are not in the file: the element is drawn, and what
 * is drawn says which part is missing. It replaces an empty box — or worse, a `<video>` or an
 * `<img>` pointing at an address that resolves to nothing, which reads as a page that loaded
 * slowly forever. The kind serves the tests; the label serves the reader.
 */
export function UnavailableFrame({ kind, label }: { kind: string; label: string }) {
  return (
    <div
      data-slide-unavailable={kind}
      className='flex size-full items-center justify-center overflow-hidden rounded border border-dashed border-[var(--border-subtle)] px-3 text-center text-xs text-[var(--text-tertiary)]'
    >
      {label}
    </div>
  )
}

export const UnsupportedElement = memo(function UnsupportedElement({
  el,
  reason,
}: {
  el: SlideElement
  reason?: string
}) {
  useEffect(() => {
    // The reason is what names the trouble; without one the trouble is the type itself.
    const trouble = reason
      ? `cannot draw the "${el.type}" element (id ${el.id}): ${reason}`
      : `unsupported element type "${el.type}" (id ${el.id})`
    console.warn(`[inkstone] slides: ${trouble}`)
  }, [el.id, el.type, reason])

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
