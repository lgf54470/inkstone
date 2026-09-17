import { act, createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { highlightWithPrism } from '../../prism'
import { renderElement } from '../../../test-render'
import type { CodeElement } from '../types'
import { SlideCodeBlock } from './code-block'

const code: CodeElement = {
  id: 'code-1',
  type: 'code',
  x: 0,
  y: 0,
  w: 600,
  h: 300,
  lang: 'javascript',
  code: 'const answer = 42 // life',
}

function draw(el: CodeElement, palette?: Record<string, string>) {
  return renderElement(createElement(SlideCodeBlock, { el, palette }))
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('a slide code block', () => {
  it('paints the deck own palette onto the wrapper', () => {
    const view = draw(code, { k: '#123456' })
    const wrapper = view.container.querySelector<HTMLElement>('[data-slide-code]')
    expect(wrapper?.style.getPropertyValue('--bento-code-k')).toBe('#123456')
    expect(wrapper?.style.getPropertyValue('--bento-code-c')).not.toBe('')
    view.unmount()
  })

  it('replaces the plain text with highlighted tokens once the grammar arrives', async () => {
    // The grammar is loaded on demand; loading it here is what the effect would have to
    // wait for, so the paint under test is the swap rather than the network.
    await highlightWithPrism(code.code, 'javascript')

    const view = draw(code)
    expect(view.container.querySelector('.bento-slide-code')?.textContent).toBe(code.code)
    await settle()
    expect(view.container.querySelectorAll('.bento-slide-code .token').length).toBeGreaterThan(0)
    view.unmount()
  })

  it('keeps the snippet readable in a language nobody supports', async () => {
    const view = draw({ ...code, lang: 'klingon' })
    await settle()
    expect(view.container.querySelector('.bento-slide-code')?.textContent).toBe(code.code)
    expect(view.container.querySelector('.bento-slide-code .token')).toBeNull()
    view.unmount()
  })
})
