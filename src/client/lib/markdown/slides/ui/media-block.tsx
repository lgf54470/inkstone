import { memo } from 'react'
import { t } from '../../../i18n'
import type { MediaElement } from '../types'
import { mediaAutoplays, mediaFit, resolveMediaSrc } from '../media'

interface SlideMediaBlockProps {
  el: MediaElement
  assets?: Record<string, string>
  /**
   * Whether the clip takes pointer input, which is the show and not the editor: on the
   * canvas the box has to stay draggable, so a video there is a frame rather than a player.
   */
  interactive: boolean
}

/**
 * A clip is played by the browser's own controls, never by a hand-built bar: they are the
 * controls the reader already knows, they are keyboard- and screen-reader-complete for
 * free, and a deck cannot get their focus behaviour wrong. What this component decides is
 * only what the format's fields mean — which bytes to load, and whether to start on its own.
 */
export const SlideMediaBlock = memo(function SlideMediaBlock({
  el,
  assets,
  interactive,
}: SlideMediaBlockProps) {
  const src = resolveMediaSrc(el.src, assets)
  if (!src) return <MediaUnavailable />

  const common = {
    src,
    controls: el.controls !== false,
    loop: el.loop === true,
    muted: el.muted === true,
    tabIndex: interactive ? 0 : -1,
    'data-slide-media': el.kind,
  } as const

  if (el.kind === 'audio') {
    return <audio {...common} autoPlay={mediaAutoplays(el)} preload='metadata' className='w-full' />
  }

  const poster = el.poster ? resolveMediaSrc(el.poster, assets) : ''
  const autoplay = mediaAutoplays(el)
  const style = el.radius ? { borderRadius: `${el.radius}px` } : undefined

  return (
    <video
      {...common}
      // A browser only starts a clip on its own while it is muted, so an autoplaying
      // element is muted here rather than left to the document to remember.
      muted={el.muted === true || autoplay}
      autoPlay={autoplay}
      poster={poster || undefined}
      preload='metadata'
      playsInline
      style={{ ...style, objectFit: mediaFit(el) }}
      className='size-full overflow-hidden'
    />
  )
})

function MediaUnavailable() {
  return (
    <div className='flex size-full items-center justify-center rounded border border-dashed border-[var(--border-subtle)] px-3 text-center text-xs text-[var(--text-tertiary)]'>
      {t('slides.media_unavailable')}
    </div>
  )
}
