import { useMemo, type Ref } from 'react'
import type { ProseFont } from '@shared/types'
import { cn } from '../../lib/cn'

// The html object identity matters: React re-applies `dangerouslySetInnerHTML`
// whenever the object changes, which would wipe every rendered diagram on any
// re-render (pagination, theme, controls). Memoizing per html string keeps the
// markup untouched unless the slide content itself changed.
export function SlideProse({ html, contentWidth, font, hostRef, className }: {
  html: string
  contentWidth: number
  font: ProseFont
  hostRef?: Ref<HTMLDivElement>
  className?: string
}) {
  const htmlObj = useMemo(() => ({ __html: html }), [html])
  return (
    <div className='mx-auto' style={{ width: contentWidth }}>
      <div className='ink-preview-container' data-font={font}>
        <div ref={hostRef} data-font={font} data-slide-page className={cn('ink-prose relative', className)} dangerouslySetInnerHTML={htmlObj} />
      </div>
    </div>
  )
}
