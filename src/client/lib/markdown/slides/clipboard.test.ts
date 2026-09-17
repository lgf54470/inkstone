import { describe, expect, it } from 'vitest'
import type { ShapeElement, SlideElement, TextElement } from './types'
import { PASTE_OFFSET, collectClipAssets, clipElements, pasteClip, readClip } from './clipboard'

const ASSETS = { photo: 'data:image/png;base64,AAA', clip: 'data:video/mp4;base64,BBB' }

function text(over: Partial<TextElement> = {}): TextElement {
  return { id: 'text-1', type: 'text', html: '<p>Hello</p>', fontSize: 24, x: 100, y: 50, w: 300, h: 80, ...over }
}

function shape(over: Partial<ShapeElement> = {}): ShapeElement {
  return { id: 'shape-1', type: 'shape', shape: 'rect', fill: '#FF9E8A', x: 10, y: 20, w: 120, h: 60, ...over }
}

describe('a copy of deck elements', () => {
  it('comes back as the elements it left with', () => {
    const clip = readClip(clipElements([text(), shape()], ASSETS))
    expect(clip?.elements).toHaveLength(2)
    expect(clip?.elements[0]).toMatchObject({ type: 'text', html: '<p>Hello</p>', x: 100, y: 50 })
    expect(clip?.elements[1]).toMatchObject({ type: 'shape', shape: 'rect', fill: '#FF9E8A' })
  })

  it('brings only the assets its elements point at', () => {
    const image: SlideElement = { id: 'i1', type: 'image', src: 'asset:photo', x: 0, y: 0, w: 10, h: 10 }
    expect(collectClipAssets([image], ASSETS)).toEqual({ photo: ASSETS.photo })
    expect(JSON.parse(clipElements([image], ASSETS).replace('"mark"', '"mark"')).assets).toEqual({
      photo: ASSETS.photo,
    })
  })

  it('leaves out an asset key the document does not carry', () => {
    const image: SlideElement = { id: 'i1', type: 'image', src: 'asset:missing', x: 0, y: 0, w: 10, h: 10 }
    expect(collectClipAssets([image], ASSETS)).toEqual({})
  })
})

describe('reading a clip off the clipboard', () => {
  it('refuses text that is not one of ours', () => {
    expect(readClip('some prose')).toBeNull()
    expect(readClip('{"mark":"someone-else","elements":[]}')).toBeNull()
    expect(readClip('')).toBeNull()
  })

  it('drops an element kind this build cannot carry', () => {
    const payload = JSON.stringify({
      mark: 'inkstone/slides-clip',
      version: 1,
      elements: [text(), { id: 'x', type: 'timeline', x: 0, y: 0, w: 10, h: 10 }],
    })
    const clip = readClip(payload)
    expect(clip?.elements.map((element) => element.type)).toEqual(['text'])
  })

  it('drops an element with no geometry and refuses a payload that leaves nothing', () => {
    const payload = JSON.stringify({
      mark: 'inkstone/slides-clip',
      version: 1,
      elements: [{ id: 'x', type: 'shape', shape: 'rect', fill: '#fff', x: 0, y: 0, w: 0, h: 10 }],
    })
    expect(readClip(payload)).toBeNull()
  })
})

describe('pasting a clip into a deck', () => {
  it('lands nudged, with fresh ids, so a copy is another element rather than the same one twice', () => {
    const clip = readClip(clipElements([text({ id: 'text-1' })], ASSETS))
    const pasted = clip ? pasteClip(clip, ASSETS).elements : []
    expect(pasted).toHaveLength(1)
    expect(pasted[0]?.id).not.toBe('text-1')
    expect(pasted[0]?.x).toBe(100 + PASTE_OFFSET)
    expect(pasted[0]?.y).toBe(50 + PASTE_OFFSET)
  })

  it('detaches what it pastes, so editing the copy cannot reach back into the original', () => {
    const original = text()
    const clip = readClip(clipElements([original], ASSETS))
    const pasted = clip ? pasteClip(clip, ASSETS).elements : []
    ;(pasted[0] as TextElement).html = '<p>changed</p>'
    expect(original.html).toBe('<p>Hello</p>')
  })

  it('keeps the deck own bytes under a colliding key and repoints the pasted element', () => {
    const clip = readClip(clipElements([{ id: 'i1', type: 'image', src: 'asset:photo', x: 0, y: 0, w: 10, h: 10 }], ASSETS))
    const deckAssets = { photo: 'data:image/png;base64,OTHER' }
    const { elements, assets } = clip ? pasteClip(clip, deckAssets) : { elements: [], assets: {} }
    expect(assets.photo).toBe('data:image/png;base64,OTHER')
    const key = elements[0]?.type === 'image' ? elements[0].src : ''
    expect(key.startsWith('asset:photo-')).toBe(true)
    expect(assets[key.slice('asset:'.length)]).toBe(ASSETS.photo)
  })

  it('reuses the key when the deck already carries the very same bytes', () => {
    const clip = readClip(clipElements([{ id: 'i1', type: 'image', src: 'asset:photo', x: 0, y: 0, w: 10, h: 10 }], ASSETS))
    const { elements, assets } = clip ? pasteClip(clip, { ...ASSETS }) : { elements: [], assets: {} }
    expect(Object.keys(assets)).toEqual(['photo', 'clip'])
    expect(elements[0]?.type === 'image' ? elements[0].src : '').toBe('asset:photo')
  })
})
