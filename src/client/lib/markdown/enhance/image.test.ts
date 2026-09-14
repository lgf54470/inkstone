import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n, t } from '../../i18n'
import { wrapZoomableImages } from './image'

beforeAll(async () => {
  await initI18n()
})

function mount(markup: string): HTMLElement {
  const root = document.createElement('div')
  root.className = 'ink-prose'
  root.innerHTML = markup
  return root
}

describe('prose images become controls', () => {
  it('puts a button around a prose image and names the action', () => {
    const root = mount('<p><img src="/probe.png" alt="probe"></p>')

    wrapZoomableImages(root)

    const button = root.querySelector<HTMLButtonElement>('[data-image-zoom]')!
    expect(button.tagName).toBe('BUTTON')
    expect(button.type).toBe('button')
    expect(button.getAttribute('aria-label')).toBe(t('preview.image_preview'))
    // The image itself keeps the markdown's own attributes: only its parent changed.
    expect(button.querySelector<HTMLImageElement>('img')?.getAttribute('src')).toBe('/probe.png')
    expect(button.querySelector<HTMLImageElement>('img')?.getAttribute('alt')).toBe('probe')
  })

  it('leaves an image that is already a link, or one a widget drew, alone', () => {
    const root = mount([
      '<p><a href="/full.png"><img src="/thumb.png" alt="linked"></a></p>',
      '<pre><img src="/in-code.png" alt="code"></pre>',
      '<div data-mindmap><img src="/snapshot.svg" alt="map"></div>',
      '<div data-chart><img src="/chart.png" alt="chart"></div>',
      '<div class="markdown-example-preview"><div class="markdown-example-preview-body"><img src="/demo.png" alt="example"></div></div>',
    ].join(''))

    wrapZoomableImages(root)

    expect(root.querySelectorAll('[data-image-zoom]')).toHaveLength(0)
  })

  it('does not wrap an image twice when the preview renders again', () => {
    const root = mount('<p><img src="/probe.png" alt="probe"></p>')

    wrapZoomableImages(root)
    wrapZoomableImages(root)

    expect(root.querySelectorAll('[data-image-zoom]')).toHaveLength(1)
  })
})
