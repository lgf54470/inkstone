/**
 * A deck of fences rendered on a surface that cannot run the deck editor.
 *
 * The block ships with a head and a "Loading slides…" placeholder, and only a host that mounts the
 * live deck and can write edits back ever replaces that text. A slide, a printed page, an exported
 * note, a hover card and a shared page are none of those things, and they used to print the promise
 * as if it were the content (N-38, measured against a real exported PDF).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n, t } from '../../i18n'
import { installTestGlobals } from '../../test-render'
import { registerFenceBodies } from '../fence-bodies'
import { renderMarkdown } from '../renderer'
import { renderStaticSlides } from './static'

beforeAll(async () => {
  installTestGlobals()
  await initI18n()
})

const DECK = JSON.stringify({
  format: 'bento-slides',
  version: 1,
  title: 'Gate deck',
  slides: [
    { id: 'a', title: 'Why now', elements: [{ id: 'e1', type: 'text', html: 'The deadline is Friday.', x: 0, y: 0, w: 10, h: 10 }, { id: 'e2', type: 'text', html: 'Two of three plans fit.', x: 0, y: 20, w: 10, h: 10 }, { id: 'e3', type: 'text', html: 'Third line nobody reads.', x: 0, y: 40, w: 10, h: 10 }] },
    { id: 'b', title: 'What next', elements: [{ id: 'e4', type: 'shape', shapeType: 'rect', x: 0, y: 0, w: 10, h: 10 }] },
  ],
})

function slidesHost(body: string): HTMLElement {
  const host = document.createElement('div')
  host.className = 'ink-prose'
  const rendered = renderMarkdown(['```bento-slides', body, '```'].join('\n'))
  host.innerHTML = rendered.html
  registerFenceBodies(host, rendered.fences)
  document.body.append(host)
  return host
}

function block(host: HTMLElement): HTMLElement {
  const node = host.querySelector<HTMLElement>('[data-bento-slides]')
  if (!node) throw new Error('the renderer emitted no slides block')
  return node
}

describe('renderStaticSlides — the deck a serialized surface gets', () => {
  it('draws one card per slide, titled and read from its own text', () => {
    const host = slidesHost(DECK)
    const node = block(host)

    expect(renderStaticSlides(host)).toBe(true)

    const cards = [...node.querySelectorAll('.bento-slides-fallback-card')]
    expect(cards.map((card) => card.querySelector('div')?.textContent)).toEqual(['Why now', 'What next'])
    expect(cards[0]?.textContent).toContain('The deadline is Friday. · Two of three plans fit.')
  })

  it('says the deck is drawn instead of leaving the loading promise up', () => {
    const host = slidesHost(DECK)
    const node = block(host)
    expect(node.textContent).toContain(t('preview.slides_loading'))

    renderStaticSlides(host)

    expect(node.textContent).not.toContain(t('preview.slides_loading'))
    expect(node.getAttribute('aria-busy')).toBe('false')
    expect(node.classList.contains('loading')).toBe(false)
    expect(node.classList.contains('is-ready')).toBe(true)
  })

  it('draws each block of a page, and only once each', () => {
    const host = slidesHost(DECK)
    const second = slidesHost(DECK)
    host.append(second.querySelector('[data-bento-slides]')!)

    expect(renderStaticSlides(host)).toBe(true)
    expect(host.querySelectorAll('.bento-slides-fallback-grid')).toHaveLength(2)
    // A second pass is what the printed sheet runs over a page it already drew: nothing to redo,
    // and saying so is what stops the canvas from measuring the same page again.
    expect(renderStaticSlides(host)).toBe(false)
  })
})

  it('reports a body it cannot read instead of hanging on it', () => {
    const host = slidesHost('{ this is not a deck }')
    const node = block(host)

    renderStaticSlides(host)

    expect(node.classList.contains('has-error')).toBe(true)
    expect(node.querySelector('.bento-slides-error-message')?.textContent).toContain(t('preview.slides_render_failed'))
    expect(node.getAttribute('aria-busy')).toBe('false')
  })

describe('renderStaticSlides — the line a card reads under its title', () => {
  it('keeps a slide that echoes its own title out of the card\'s line of text', () => {
    // An outline deck's first text element *is* its heading, so a card that pasted the element list
    // under the title would read the same words twice — the two lines the card has room for are
    // better spent on what is under the title.
    const host = slidesHost('# Why now\n\n- The deadline is Friday.\n- Two of three plans fit.')

    renderStaticSlides(host)

    const card = host.querySelector('.bento-slides-fallback-card')!
    expect(card.textContent).toBe('Why nowThe deadline is Friday. Two of three plans fit.')
  })

  it('reads an outline body through the same channel', () => {
    const host = slidesHost('# Why now\n\n- The deadline is Friday.\n\n# What next\n\n- Two of three plans fit.')
    const node = block(host)

    renderStaticSlides(host)

    expect(node.querySelector('.bento-slides-fallback-card')?.textContent).toContain('Why now')
    expect(node.getAttribute('aria-busy')).toBe('false')
  })
})
