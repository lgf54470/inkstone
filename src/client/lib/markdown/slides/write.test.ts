import { describe, expect, it } from 'vitest'
import { flushSlidesEntry, scheduleSlidesWrite } from './write'
import { parseSlidesOutline } from './outline'
import { serializeSlides } from './body'
import type { SlidesBlockEntry } from './entry'
import type { BentoDoc, SlideElement, SlidesWriteResult } from './types'
import { vi } from 'vitest'

/** Rewrites the text element an outline body produced, which is the edit that has to stay expressible. */
function editBodyText(doc: BentoDoc, html: string): BentoDoc {
  const slide = doc.slides[0]
  if (!slide) throw new Error('missing slide')
  return {
    ...doc,
    slides: [
      {
        ...slide,
        elements: slide.elements.map((el) =>
          el.id === 'body-1' && el.type === 'text' ? { ...el, html } : el,
        ),
      },
    ],
  }
}

const SHAPE: SlideElement = { id: 'shape-1', type: 'shape', shape: 'rect', fill: '#FF9E8A', x: 40, y: 40, w: 120, h: 80 }

function entryFor(data: BentoDoc, mode: 'json' | 'outline', body: string, result: SlidesWriteResult = 'written') {
  const written: string[] = []
  const pending: boolean[] = []
  let notices = 0
  const entry: SlidesBlockEntry = {
    key: 'scope#1',
    scope: 'scope',
    noteId: 'note-1',
    index: 0,
    host: document.createElement('div'),
    source: body,
    data,
    mode,
    editable: true,
    owner: 'inline',
    dark: false,
    locale: 'en-US',
    container: null,
    root: null,
    ref: { line: 3, body },
    write: (_ref, nextBody): SlidesWriteResult => {
      written.push(nextBody)
      return result
    },
    notice: () => {
      notices += 1
    },
    report: (value) => pending.push(value),
    dirty: true,
    timer: null,
  }
  return { entry, written, pending, notices: () => notices }
}

describe('flushSlidesEntry', () => {
  it('keeps writing the outline syntax while the deck still fits it', () => {
    const source = '# Title\nBody text'
    const doc = parseSlidesOutline(source)
    const { entry, written, notices } = entryFor(doc, 'outline', source)
    entry.data = editBodyText(doc, '<p>Edited</p>')
    entry.dirty = true
    expect(flushSlidesEntry(entry)).toBe('written')
    expect(entry.mode).toBe('outline')
    expect(written[0]).toBe('# Title\nEdited')
    expect(notices()).toBe(0)
  })

  it('writes JSON once an edit leaves the dialect behind, and says so once', () => {
    const source = '# Title\nBody text'
    const doc = parseSlidesOutline(source)
    const { entry, written, notices } = entryFor(doc, 'outline', source)
    const slide = doc.slides[0]
    if (!slide) throw new Error('missing slide')
    entry.data = { ...doc, slides: [{ ...slide, elements: [...slide.elements, SHAPE] }] }
    entry.dirty = true
    expect(flushSlidesEntry(entry)).toBe('written')
    expect(entry.mode).toBe('json')
    expect(notices()).toBe(1)
    const body = written[0]
    if (body === undefined) throw new Error('nothing written')
    const parsed = JSON.parse(body) as BentoDoc
    expect(parsed.slides[0]?.elements.some((el) => el.type === 'shape')).toBe(true)
    expect(entry.ref?.body).toBe(body)
  })

  it('does not write when nothing changed', () => {
    const doc = parseSlidesOutline('# Title\nBody text')
    const { entry, written } = entryFor(doc, 'json', serializeSlides(doc, 'json'))
    expect(flushSlidesEntry(entry)).toBeNull()
    expect(written).toHaveLength(0)
  })

  it('writes nothing when the fence reference or the writer is gone', () => {
    const doc = parseSlidesOutline('# Title')
    const { entry } = entryFor(doc, 'outline', '# Title')
    entry.ref = null
    expect(flushSlidesEntry(entry)).toBeNull()
    entry.ref = { line: 1, body: '# Title' }
    entry.write = null
    expect(flushSlidesEntry(entry)).toBeNull()
  })
})

describe('flushSlidesEntry pending state', () => {
  it('reports the pending state from the edit until the write lands', () => {
    vi.useFakeTimers()
    try {
      const source = '# Title\nBody text'
      const doc = parseSlidesOutline(source)
      const { entry, pending } = entryFor(doc, 'outline', source)
      entry.dirty = false
      vi.spyOn(window, 'setTimeout')
      scheduleSlidesWrite(entry)
      expect(pending).toEqual([true])
      vi.runAllTimers()
      expect(pending).toEqual([true, false])
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the pending state when the note refused the write', () => {
    const source = '# Title\nBody text'
    const doc = parseSlidesOutline(source)
    const { entry, pending } = entryFor(editBodyText(doc, '<p>Edited</p>'), 'outline', source, 'conflict')
    expect(flushSlidesEntry(entry)).toBe('conflict')
    expect(pending).toEqual([true])
  })
})
