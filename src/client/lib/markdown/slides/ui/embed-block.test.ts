import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { t } from '../../../i18n'
import { renderElement } from '../../../test-render'
import type { EmbedElement } from '../types'
import { SlideEmbedBlock } from './embed-block'

function draw(over: Partial<EmbedElement>) {
  const el: EmbedElement = { id: 'e1', type: 'embed', x: 0, y: 0, w: 400, h: 240, ...over }
  return renderElement(createElement(SlideEmbedBlock, { el }))
}

describe('a slide embed', () => {
  it('draws the view the file carries, with a script in it left out', () => {
    const view = draw({ view: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>' })
    expect(view.container.querySelector('[data-slide-embed="inline"] svg')).not.toBeNull()
    view.unmount()

    const hostile = draw({ view: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' })
    expect(hostile.container.querySelector('script')).toBeNull()
    hostile.unmount()
  })

  it('offers an address as a link that leaves the note, and never as a frame', () => {
    const view = draw({ url: 'https://bento.page/dash/' })
    const link = view.container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://bento.page/dash/')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toContain('noopener')
    expect(view.container.querySelector('iframe')).toBeNull()
    expect(view.container.textContent).toContain(t('slides.embed_no_live'))
    view.unmount()
  })

  it('says so when there is neither a view nor an address it may use', () => {
    const empty = draw({})
    expect(empty.container.textContent).toContain(t('slides.embed_unavailable'))
    empty.unmount()

    const hostile = draw({ url: 'javascript:alert(1)' })
    expect(hostile.container.querySelector('a')).toBeNull()
    expect(hostile.container.textContent).toContain(t('slides.embed_unavailable'))
    hostile.unmount()
  })
})
