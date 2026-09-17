import { act, createElement, useEffect, useRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderElement } from '../../../test-render'
import type { BentoDoc, Slide, TextElement } from '../types'
import { useSlidesKeys, type SlidesKeyIntents } from './use-slides-keys'
import { useSlidesEditing } from './use-slides-editing'
import { zoomCommand } from './slides-stage'

const PASTE_OFFSET = 20

function text(id: string, x = 0, y = 0): TextElement {
  return { id, type: 'text', html: `<p>${id}</p>`, fontSize: 24, x, y, w: 200, h: 60 }
}

function deck(): BentoDoc {
  const slide: Slide = { id: 'one', elements: [text('a'), text('b', 300, 300)] }
  return {
    format: 'bento/slides',
    version: 1,
    title: 'Deck',
    size: { width: 1280, height: 720 },
    theme: { background: '#ffffff', color: '#111111', accent: '#FF9E8A' },
    slides: [slide],
  }
}

interface Harness {
  doc: BentoDoc
  selected: string[]
  zoom: number
  images: File[]
}

let mounted: ReturnType<typeof renderElement> | null = null

/**
 * The editor reduced to what the hook needs: a document in state, a selection, a zoom, and the
 * picture path. Assertions read the harness, so what is checked is the document the hook edited
 * rather than the internals of the hook.
 */
function DeckHost({ start, harness, selected: initially }: { start: BentoDoc; harness: Harness; selected: string[] }) {
  const [data, setData] = useState(start)
  const [zoom, setZoom] = useState(1)
  const selected = useRef<string[]>(initially)
  const editing = useSlidesEditing({
    enabled: true,
    doc: data,
    targetSlideId: () => data.slides[0]?.id ?? null,
    selectedIds: () => selected.current,
    commit: (update) => setData((previous) => update(previous)),
    select: (ids) => {
      selected.current = ids
      harness.selected = ids
    },
    zoom: (command) => setZoom((current) => zoomCommand(current, command)),
    pasteImage: (file) => harness.images.push(file),
  })
  useEffect(() => {
    harness.doc = data
    harness.zoom = zoom
  }, [data, harness, zoom])
  return createElement(
    'button',
    {
      type: 'button',
      'data-paste': 'text',
      onClick: () => editing.pasteText('pasted from somewhere else'),
    },
    'paste',
  )
}

/** The keys intents of a host that does nothing, for the cases where only the event matters. */
const IDLE_INTENTS: SlidesKeyIntents = {
  onCopy: () => null,
  onCut: () => null,
  onPaste: () => false,
  onDelete: () => true,
  onDuplicate: () => true,
  onNudge: () => true,
  onZoom: () => true,
}

function mount(start = deck(), selected: string[] = ['a']): Harness {
  const harness: Harness = { doc: start, selected, zoom: 1, images: [] }
  mounted = renderElement(createElement(DeckHost, { start, harness, selected }))
  return harness
}

interface ClipboardPayload {
  text?: string
  files?: File[]
}

/** A clipboard event jsdom does not build: the property is what the listener reads. */
function fire(type: 'copy' | 'cut' | 'paste', payload: ClipboardPayload = {}): { written: string; prevented: boolean } {
  const store: Record<string, string> = {}
  if (payload.text !== undefined) store['text/plain'] = payload.text
  const event = new Event(type, { cancelable: true, bubbles: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      setData: (format: string, value: string) => {
        store[format] = value
      },
      getData: (format: string) => store[format] ?? '',
      files: payload.files ?? [],
    },
  })
  act(() => {
    window.dispatchEvent(event)
  })
  return { written: store['text/plain'] ?? '', prevented: event.defaultPrevented }
}

function press(key: string, options: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...options })
  act(() => {
    window.dispatchEvent(event)
  })
  return event.defaultPrevented
}

function elements(harness: Harness): string[] {
  return harness.doc.slides[0]?.elements.map((element) => element.id) ?? []
}

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

describe('a copy and a paste', () => {
  it('pastes the copied element back as a nudged copy with a fresh id', () => {
    const harness = mount()
    const copied = fire('copy')
    expect(copied.prevented).toBe(true)
    expect(JSON.parse(copied.written).mark).toBe('inkstone/slides-clip')

    fire('paste', { text: copied.written })
    const [first, second, third] = harness.doc.slides[0]?.elements ?? []
    expect(harness.doc.slides[0]?.elements).toHaveLength(3)
    expect(third?.id).not.toBe(first?.id)
    expect([third?.x, third?.y]).toEqual([(first?.x ?? 0) + PASTE_OFFSET, (first?.y ?? 0) + PASTE_OFFSET])
    expect(harness.selected).toEqual([third?.id])
    expect([second?.x, second?.y]).toEqual([300, 300])
  })
})

describe('the clipboard in the editor', () => {
  it('cuts the selection: the payload leaves and the element does not stay', () => {
    const harness = mount()
    const cut = fire('cut')
    expect(cut.prevented).toBe(true)
    expect(elements(harness)).toEqual(['b'])
    expect(harness.selected).toEqual([])
  })

  it('turns somebody else text into an escaped text box', () => {
    const harness = mount()
    fire('paste', { text: '<b>hi</b>\nsecond line' })
    const pasted = harness.doc.slides[0]?.elements.at(-1)
    expect(pasted?.type).toBe('text')
    expect(pasted?.type === 'text' ? pasted.html : '').toBe('&lt;b&gt;hi&lt;/b&gt;<br>second line')
  })

  it('leaves the keyboard to a text box: nothing is copied or deleted while typing', () => {
    const harness = mount()
    const box = document.createElement('div')
    box.setAttribute('contenteditable', 'true')
    document.body.appendChild(box)

    const event = new Event('copy', { cancelable: true, bubbles: true })
    Object.defineProperty(event, 'clipboardData', { value: { setData: () => {}, getData: () => '', files: [] } })
    act(() => {
      box.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(false)

    const key = new KeyboardEvent('keydown', { key: 'Delete', cancelable: true, bubbles: true })
    act(() => {
      box.dispatchEvent(key)
    })
    expect(key.defaultPrevented).toBe(false)
    expect(elements(harness)).toEqual(['a', 'b'])
    box.remove()
  })
})

describe('a page on the clipboard', () => {
  it('copies the page itself when nothing is selected, and pastes it back as a new page', () => {
    const harness = mount(deck(), [])
    const copied = fire('copy')
    expect(copied.prevented).toBe(true)
    expect(JSON.parse(copied.written).kind).toBe('slides')

    fire('paste', { text: copied.written })
    expect(harness.doc.slides).toHaveLength(2)
    const [source, pasted] = harness.doc.slides
    expect(pasted?.id).not.toBe(source?.id)
    expect(pasted?.elements).toHaveLength(2)
    expect(pasted?.elements.map((element) => element.id)).not.toEqual(source?.elements.map((element) => element.id))
  })

  it('leaves a highlighted passage to the browser rather than taking the copy for the page', () => {
    const harness = mount(deck(), [])
    const range = document.createRange()
    range.selectNodeContents(document.body)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    const copied = fire('copy')
    expect(copied.prevented).toBe(false)
    expect(copied.written).toBe('')
    expect(harness.doc.slides).toHaveLength(1)

    selection?.removeAllRanges()
  })
})

describe('what a paste becomes', () => {
  it('sends a pasted picture down the same path the insert dialog uses', () => {
    const harness = mount()
    const file = new File(['bytes'], 'photo.png', { type: 'image/png' })
    const event = fire('paste', { files: [file] })
    expect(event.prevented).toBe(true)
    expect(harness.images.map((image) => image.name)).toEqual(['photo.png'])
    expect(elements(harness)).toEqual(['a', 'b'])
  })
})

describe('the editor keyboard', () => {
  it('duplicates the selection, then deletes the copy it just selected', () => {
    const harness = mount()
    expect(press('d', { metaKey: true })).toBe(true)
    const copy = harness.selected[0]
    expect(harness.doc.slides[0]?.elements).toHaveLength(3)

    expect(press('Delete')).toBe(true)
    expect(elements(harness)).toEqual(['a', 'b'])
    expect(elements(harness)).not.toContain(copy)
  })

  it('nudges by a pixel, and by ten while shift is held', () => {
    const harness = mount()
    press('ArrowRight')
    expect(harness.doc.slides[0]?.elements[0]?.x).toBe(1)
    press('ArrowDown', { shiftKey: true })
    expect(harness.doc.slides[0]?.elements[0]?.y).toBe(-10)
  })

  it('zooms by the command the corner controls use, and resets on zero', () => {
    const harness = mount()
    press('=', { metaKey: true })
    expect(harness.zoom).toBeCloseTo(1.1)
    press('0', { metaKey: true })
    expect(harness.zoom).toBe(1)
    press('-', { ctrlKey: true })
    expect(harness.zoom).toBeCloseTo(0.9)
  })

  it('ignores a plain arrow key that is meant for the browser and reports nothing handled', () => {
    const harness = mount()
    expect(press('a')).toBe(false)
    expect(harness.doc.slides[0]?.elements[0]?.x).toBe(0)
  })
})

/** The keys hook on its own: what it does with an event when the editor has no selection at all. */
function KeysHost({ intents }: { intents: SlidesKeyIntents }) {
  useSlidesKeys(true, intents)
  return null
}

describe('the keys hook without a document to edit', () => {
  it('does not prevent an event no intent took', () => {
    mounted = renderElement(createElement(KeysHost, { intents: IDLE_INTENTS }))
    const event = new Event('paste', { cancelable: true, bubbles: true })
    Object.defineProperty(event, 'clipboardData', { value: { setData: () => {}, getData: () => 'text', files: [] } })
    act(() => {
      window.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(false)
  })
})
