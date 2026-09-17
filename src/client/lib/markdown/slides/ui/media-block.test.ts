import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { t } from '../../../i18n'
import { renderElement } from '../../../test-render'
import type { MediaElement } from '../types'
import { SlideMediaBlock } from './media-block'

const ASSETS = { clip: 'data:video/mp4;base64,AAA', poster: 'data:image/png;base64,AAA' }

function draw(el: Partial<MediaElement>, interactive = false) {
  const element: MediaElement = {
    id: 'm1',
    type: 'media',
    kind: 'video',
    src: 'asset:clip',
    x: 0,
    y: 0,
    w: 640,
    h: 360,
    ...el,
  }
  return renderElement(
    createElement(SlideMediaBlock, { el: element, assets: ASSETS, interactive }),
  )
}

describe('a slide clip', () => {
  it('plays the bytes its asset key names, and says so when the key has nothing', () => {
    const view = draw({})
    expect(view.container.querySelector('video')?.getAttribute('src')).toBe(
      'data:video/mp4;base64,AAA',
    )
    view.unmount()

    const missing = draw({ src: 'asset:nope' })
    expect(missing.container.querySelector('video')).toBeNull()
    expect(missing.container.textContent).toContain(t('slides.media_unavailable'))
    missing.unmount()
  })

  it('takes pointer input in a show and not on the canvas', () => {
    const show = draw({}, true)
    expect(show.container.querySelector('video')?.getAttribute('tabindex')).toBe('0')
    show.unmount()

    const canvas = draw({}, false)
    expect(canvas.container.querySelector('video')?.getAttribute('tabindex')).toBe('-1')
    canvas.unmount()
  })

})

describe('how a clip behaves and how it is framed', () => {
  it('mutes a clip it starts on its own, which is the only way a browser starts one', () => {
    const view = draw({ autoplay: true })
    const video = view.container.querySelector('video')
    expect(video?.hasAttribute('autoplay')).toBe(true)
    // React sets `muted` as a property rather than an attribute, so the property is where
    // the browser reads it from too.
    expect(video?.muted).toBe(true)
    view.unmount()

    const quiet = draw({ autoplay: true, muted: false })
    expect(quiet.container.querySelector('video')?.muted).toBe(true)
    quiet.unmount()
  })

  it('carries the poster and the fit the document asked for, and keeps a radius', () => {
    const view = draw({ poster: 'asset:poster', fit: 'contain', radius: 12 })
    const video = view.container.querySelector('video')
    expect(video?.getAttribute('poster')).toBe('data:image/png;base64,AAA')
    expect(video?.style.objectFit).toBe('contain')
    expect(video?.style.borderRadius).toBe('12px')
    view.unmount()
  })

  it('paints audio with the browser player instead of a video frame', () => {
    const view = draw({ kind: 'audio', controls: true })
    expect(view.container.querySelector('audio')).not.toBeNull()
    expect(view.container.querySelector('video')).toBeNull()
    view.unmount()
  })

  it('leaves the controls out only when the document says so', () => {
    const off = draw({ controls: false })
    expect(off.container.querySelector('video')?.hasAttribute('controls')).toBe(false)
    off.unmount()

    const on = draw({})
    expect(on.container.querySelector('video')?.hasAttribute('controls')).toBe(true)
    on.unmount()
  })
})
