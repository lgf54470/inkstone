import { memo } from 'react'
import { t } from '../../../i18n'
import type { EmbedElement } from '../types'
import { embedUrl, embedUrlIsSafe, embedViewIsInline } from '../embed'
import { sanitizeSlideSvgMarkup } from '../sanitize'

/**
 * A view carried in the file is drawn; a view that is an address is offered as a link. The
 * second half is a deliberate limitation rather than a missing feature: running another
 * page's script inside a note would give that page the note's origin, so the deck's own
 * affordance — click through and look at it there — is what a note can honestly offer.
 */
export const SlideEmbedBlock = memo(function SlideEmbedBlock({ el }: { el: EmbedElement }) {
  if (embedViewIsInline(el.view)) {
    // The sanitizer is called in the injection expression rather than one step away: the
    // policy that reads this file looks for the call AT the site, which is where a future
    // bypass would hide (tests/slides-sanitize-policy.test.ts).
    return (
      <div
        data-slide-embed='inline'
        className='size-full overflow-hidden'
        dangerouslySetInnerHTML={{ __html: sanitizeSlideSvgMarkup(el.view ?? '') }}
      />
    )
  }

  const address = embedUrl(el.url) || el.view || ''
  if (!embedUrlIsSafe(address)) return <EmbedNotice text={t('slides.embed_unavailable')} />

  return (
    <div
      data-slide-embed='link'
      className='flex size-full flex-col items-start justify-center gap-1 overflow-hidden rounded border border-[var(--border-subtle)] px-3'
    >
      <span className='text-xs text-[var(--text-tertiary)]'>{t('slides.embed_no_live')}</span>
      <a
        href={address}
        target='_blank'
        rel='noopener noreferrer'
        className='max-w-full truncate text-sm text-[var(--accent)] underline'
      >
        {address}
      </a>
    </div>
  )
})

function EmbedNotice({ text }: { text: string }) {
  return (
    <div className='flex size-full items-center justify-center rounded border border-dashed border-[var(--border-subtle)] px-3 text-center text-xs text-[var(--text-tertiary)]'>
      {text}
    </div>
  )
}
