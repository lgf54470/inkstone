import { act, createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderElement } from '../../../test-render'
import { parseSlidesOutline } from '../outline'
import type { BentoDoc, TextElement } from '../types'
import { SlidesRoot } from './slides-root'

const source = ['# First slide', '', 'Body text', '', '---', '', '# Second slide'].join('\n')

let mounted: ReturnType<typeof renderElement> | null = null

function mountDeck(initialData: BentoDoc = parseSlidesOutline(source)) {
  const committed: BentoDoc[] = []
  mounted = renderElement(
    createElement(SlidesRoot, {
      initialData,
      isFullscreen: true,
      onUpdateData: (next: BentoDoc) => committed.push(next),
    }),
  )
  return { committed }
}

/** The box on the page. The rail draws its own copies, so every query is scoped to the page. */
function box(): HTMLElement {
  const target = document.querySelector<HTMLElement>('.bento-canvas-stage [data-slide-element]')
  expect(target, 'a box on the page').not.toBeNull()
  return target!
}

/** The box that a caret can enter: the text view inside the frame the pointer meets. */
function editableView(): HTMLElement {
  const view = box().querySelector<HTMLElement>('[contenteditable]')
  expect(view, 'the text view of the box').not.toBeNull()
  return view!
}

function doubleClick(target: HTMLElement): void {
  act(() => {
    target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  })
}

/** What a browser edit leaves behind, followed by the blur that commits it. */
function typeIn(target: HTMLElement, html: string): void {
  act(() => {
    target.innerHTML = html
    target.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
}

function textOf(doc: BentoDoc | undefined): TextElement | undefined {
  const first = doc?.slides[0]?.elements[0]
  return first?.type === 'text' ? first : undefined
}

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

describe('typing into a box on the page', () => {
  it('opens the box for editing on a double click, and puts the caret in it', () => {
    mountDeck()
    expect(editableView().getAttribute('contenteditable')).not.toBe('true')

    doubleClick(box())
    expect(editableView().getAttribute('contenteditable')).toBe('true')
    expect(document.activeElement).toBe(editableView())
  })

  it('commits what was typed once the box loses focus', () => {
    const { committed } = mountDeck()
    doubleClick(box())
    typeIn(editableView(), 'typed words')
    expect(textOf(committed.at(-1))?.html).toBe('typed words')
  })

  it('keeps markup the format carries, and strips what it does not', () => {
    const { committed } = mountDeck()
    doubleClick(box())
    typeIn(editableView(), '<p>kept</p><img src="x" onerror="boom()">')
    const html = textOf(committed.at(-1))?.html ?? ''
    expect(html).toContain('<p>kept</p>')
    expect(html).not.toContain('onerror')
  })

  it('leaves the document alone when the box comes back unchanged', () => {
    const { committed } = mountDeck()
    doubleClick(box())
    typeIn(editableView(), editableView().innerHTML)
    expect(committed).toHaveLength(0)
  })
})
