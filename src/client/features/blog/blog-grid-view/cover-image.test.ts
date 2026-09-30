import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderElement } from '../../../lib/test-render'
import { PostCoverImage } from './cover-image'

/**
 * A list of fifty cards used to fetch every cover as eagerly as the browser allowed and decode them
 * on the main thread while the reader was still scrolling the first screen.
 */
describe('post cover image', () => {
  it('defers the picture and decodes it off the main thread', () => {
    const view = renderElement(createElement(PostCoverImage, { src: 'https://cdn.example.com/a.jpg', alt: 'A post' }))

    const img = view.container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('loading')).toBe('lazy')
    expect(img?.getAttribute('decoding')).toBe('async')
    view.unmount()
  })

  it('draws the placeholder instead of an address it must not fetch', () => {
    const view = renderElement(createElement(PostCoverImage, { src: 'javascript:alert(1)', alt: 'A post' }))

    expect(view.container.querySelector('img')).toBeNull()
    view.unmount()
  })
})
