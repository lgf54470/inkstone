/**
 * The controls a slide has to give up.
 *
 * A rich block ships a head with it — full screen, fit, run, copy, the palette picker — and those
 * buttons belong to the note: they act on a live root, on the editor, on a pane the room cannot see.
 * On the projector the same block is a picture, so the buttons arrive dead, and worse than dead:
 * the stage turns the page by a click anywhere on it, and its first rule is to leave a click on an
 * interactive element alone (`presentation-stage.tsx`). A dead button therefore eats the turn the
 * presenter meant to make — the presenter reads a frozen show (N-37, measured).
 *
 * The fix is at the funnel every slide surface reads from: the markup a slide is built from carries
 * no controls at all, so the projector, the slide list, the overview grid, the presenter's panes, the
 * printed sheet and the PNG export cannot disagree about what is pressable.
 */
import { createElement } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../lib/markdown/renderer'
import { installTestGlobals, renderElement } from '../../lib/test-render'
import { renderSlideSource } from './slide-html'
import { SlideProse } from './slide-prose'

beforeAll(() => {
  installTestGlobals()
})

/** Everything the block heads ship, plus the anchor the heading plugin puts beside every title. */
const SLIDE_CONTROLS = [
  'a.heading-anchor',
  '[data-mindmap-fullscreen]',
  '[data-mindmap-fit]',
  '[data-mindmap-theme-pick]',
  '[data-excalidraw-fullscreen]',
  '[data-excalidraw-fit]',
  '[data-excalidraw-library]',
  '[data-bento-slides-fullscreen]',
  '[data-kanban-fullscreen]',
  '[data-js-run]',
  '[data-js-switch]',
  '[data-copy]',
  '[data-code-collapse]',
].join(', ')

const RICH_SLIDE = [
  '# Release plan',
  '',
  '```mindmap',
  '- Visual Probe',
  '  - Live block',
  '```',
  '',
  '```excalidraw',
  '{"type":"excalidraw","version":2,"source":"inkstone","elements":[],"appState":{},"files":{}}',
  '```',
  '',
  '```bento-slides',
  '{"title":"Gate deck","slides":[{"id":"s","elements":[]}]}',
  '```',
  '',
  '```kanban',
  '{"title":"Board","activeViewId":"v","columns":[{"id":"title","name":"Title","type":"title"},{"id":"status","name":"Status","type":"select","options":[{"id":"todo","label":"To Do"}]}],"views":[{"id":"v","name":"Board","type":"board","groupBy":"status"}],"items":[{"id":"i1","title":"A card","properties":{"status":"todo"}}]}',
  '```',
  '',
  '```js-example',
  'console.log(1)',
  '```',
  '',
  '```typescript',
  'const answer = 42',
  '```',
].join('\n')

function controlsIn(html: string): Element[] {
  const template = document.createElement('template')
  template.innerHTML = html
  return [...template.content.querySelectorAll(SLIDE_CONTROLS)]
}

describe('renderSlideSource — the markup a slide is built from', () => {
  it('carries no control a room cannot press', () => {
    const found = controlsIn(renderSlideSource(RICH_SLIDE, false).html)
    expect(found.map((node) => node.getAttribute('data-fullscreen') ?? node.className ?? node.tagName)).toEqual([])
  })

  it('keeps every block, its placeholder and its fence body, so the snapshot still has something to draw', () => {
    const rendered = renderSlideSource(RICH_SLIDE, false)
    const template = document.createElement('template')
    template.innerHTML = rendered.html

    expect(template.content.querySelector('[data-mindmap]'), 'the map block itself went away with its button').not.toBeNull()
    expect(template.content.querySelector('[data-excalidraw]')).not.toBeNull()
    expect(template.content.querySelector('[data-kanban]')).not.toBeNull()
    // The anchor left its own whitespace behind; a block collapses it, and what the room reads is
    // the title.
    expect(template.content.querySelector('h1')?.textContent?.trim()).toBe('Release plan')
    expect(rendered.fences.mindmap).toHaveLength(1)
    expect(rendered.fences.mindmap[0]).toContain('Visual Probe')
    expect(rendered.fences.excalidraw).toHaveLength(1)
    expect(rendered.fences.kanban).toHaveLength(1)
  })

  it('keeps the code a code block is showing while dropping the copy it cannot answer with', () => {
    const template = document.createElement('template')
    template.innerHTML = renderSlideSource('```ts\nconst answer = 42\n```', false).html

    expect(template.content.querySelector('pre')?.textContent).toContain('const answer = 42')
    expect(template.content.querySelector('[data-copy]')).toBeNull()
  })

  it('hands the slide surface a different markup than the note reads', () => {
    // The guard against over-reach: the same source rendered for a note keeps its head controls and
    // its heading anchors, because there they answer to a live root.
    const note = renderMarkdown(RICH_SLIDE, { externalImages: false })
    expect(controlsIn(note.html).length, 'the strip reached past the slide').toBeGreaterThan(0)
  })

  it('reaches no control on a run of slides, however the deck is split', () => {
    const slides = RICH_SLIDE.split('\n\n---\n\n')
    const total = slides.reduce((sum, slide) => sum + controlsIn(renderSlideSource(slide, false).html).length, 0)
    expect(total).toBe(0)
  })
})

describe('SlideProse — what is mounted under the projector', () => {
  it('paints a rich slide with nothing interactive in it', () => {
    const html = renderSlideSource(RICH_SLIDE, false).html
    const { container } = renderElement(createElement(SlideProse, { html, contentWidth: 1168, contentHeight: 632, font: 'sans' }))
    const page = container.querySelector('[data-slide-page]')

    expect(page?.querySelectorAll('button, a[href], input, select, textarea').length ?? -1).toBe(0)
    expect(page?.textContent).toContain('Release plan')
  })
})
