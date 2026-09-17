import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { installTestGlobals } from '../../../test-render'
import { parseSlidesOutline } from '../outline'
import type { BentoDoc } from '../types'
import { SlidesRoot } from './slides-root'

// renderElement() hands out a mount without a second render, and adoption is precisely
// about what a later render does to an already mounted surface, so this file drives its
// own root instead.
let root: Root | null = null
let container: HTMLElement | null = null

function draw(doc: BentoDoc): void {
  const element = createElement(SlidesRoot, { initialData: doc, onUpdateData: () => {} })
  if (!root) {
    installTestGlobals()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  }
  act(() => {
    root?.render(element)
  })
}

afterEach(() => {
  const mounted = root
  act(() => {
    mounted?.unmount()
  })
  container?.remove()
  root = null
  container = null
})

describe('a card mounted before the deck changed', () => {
  it('paints the deck another surface wrote, not the one it mounted with', () => {
    draw(parseSlidesOutline('# Mounted title'))
    expect(container?.textContent).toContain('Mounted title')

    draw(parseSlidesOutline('# Written elsewhere'))
    expect(container?.textContent).toContain('Written elsewhere')
    expect(container?.textContent).not.toContain('Mounted title')
  })
})
