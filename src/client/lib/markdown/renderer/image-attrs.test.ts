import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '../../i18n'
import {
  formatImageAttrs,
  hasImageAttrs,
  imageAttrMarkup,
  isImageWidthPercent,
  mergeImageAttrs,
  parseCherryImageFlags,
  parseImageAttrGroup,
} from './image-attrs'
import { renderMarkdown } from './index'

beforeAll(async () => {
  await initI18n()
})

function imageOf(source: string): HTMLImageElement | null {
  const template = document.createElement('template')
  template.innerHTML = renderMarkdown(source).html
  return template.content.querySelector('img')
}

function textOf(source: string): string {
  const template = document.createElement('template')
  template.innerHTML = renderMarkdown(source).html
  return template.content.textContent ?? ''
}

describe('image attributes: the trailing {…} group', () => {
  it('reads both size units, the alignments, the three decoration flags and the bare frame', () => {
    const parsed = parseImageAttrGroup('{width=50% height=200px align=right border shadow radius frame=none}')
    expect(parsed.unknown).toEqual([])
    expect(parsed.attrs).toEqual({
      widthPct: 50,
      heightPx: 200,
      align: 'right',
      border: true,
      shadow: true,
      radius: true,
      bare: true,
    })
  })

  it('accepts width=auto as the default it already is', () => {
    const parsed = parseImageAttrGroup('{width=auto}')
    expect(parsed.unknown).toEqual([])
    expect(hasImageAttrs(parsed.attrs)).toBe(false)
  })

  it('refuses to swallow a percentage the stylesheet cannot draw', () => {
    const parsed = parseImageAttrGroup('{width=37%}')
    expect(parsed.unknown).toEqual(['width=37%'])
    expect(parsed.attrs.widthPct).toBeUndefined()
  })

  it('refuses the whole group as soon as one token is unknown', () => {
    const parsed = parseImageAttrGroup('{width=50% onclick=alert(1)}')
    expect(parsed.unknown).toEqual(['onclick=alert(1)'])
  })

  it('rejects a percentage height, which has no meaning for an image', () => {
    expect(parseImageAttrGroup('{height=50%}').unknown).toEqual(['height=50%'])
    expect(parseImageAttrGroup('{height=120px}').attrs.heightPx).toBe(120)
  })

  it('serializes in a fixed order and emits nothing for no attributes', () => {
    expect(formatImageAttrs({ shadow: true, widthPct: 50, align: 'center' })).toBe('{width=50% align=center shadow}')
    expect(formatImageAttrs({})).toBe('')
    expect(formatImageAttrs({ widthPct: undefined })).toBe('')
  })

  it('reads back a group it wrote', () => {
    const attrs = { widthPx: 320, heightPx: 200, align: 'float-left' as const, border: true, bare: true }
    expect(parseImageAttrGroup(formatImageAttrs(attrs)).attrs).toEqual(attrs)
  })
})

describe('image attributes: the Cherry flags inside the alt text', () => {
  it('takes the first size as width and the second as height', () => {
    const parsed = parseCherryImageFlags('a dog#10%#50px')
    expect(parsed.alt).toBe('a dog')
    expect(parsed.attrs).toEqual({ widthPct: 10, heightPx: 50 })
  })

  it('lifts a flag out of the middle of a caption and keeps the rest', () => {
    const parsed = parseCherryImageFlags('photo #100px my caption')
    expect(parsed.alt).toBe('photo my caption')
    expect(parsed.attrs.widthPx).toBe(100)
  })

  it('leaves a segment it does not recognize, including C# and #1', () => {
    expect(parseCherryImageFlags('C# language').alt).toBe('C# language')
    expect(parseCherryImageFlags('#1 plan').alt).toBe('#1 plan')
    expect(parseCherryImageFlags('label #Big').alt).toBe('label #Big')
  })

  it('keeps the short flags case-sensitive, so #Big is a caption and not a border', () => {
    expect(parseCherryImageFlags('a#B').attrs.border).toBe(true)
    expect(parseCherryImageFlags('a#b').attrs.border).toBeUndefined()
  })

  it('stops reading sizes after the second one', () => {
    const parsed = parseCherryImageFlags('a#10px#20px#30px')
    expect(parsed.alt).toBe('a#30px')
    expect(parsed.attrs).toEqual({ widthPx: 10, heightPx: 20 })
  })

  it('accepts the five alignments with the flag glued to the caption', () => {
    for (const align of ['left', 'center', 'right', 'float-left', 'float-right'] as const) {
      expect(parseCherryImageFlags(`x#${align}`).attrs).toEqual({ align })
    }
  })
})

describe('image attributes: merge and markup', () => {
  it('lets the trailing group override the alt flags per key', () => {
    const fromAlt = parseCherryImageFlags('caption#100px#left').attrs
    const fromGroup = parseImageAttrGroup('{align=center}').attrs
    expect(mergeImageAttrs(fromAlt, fromGroup)).toEqual({ widthPx: 100, align: 'center' })
  })

  it('sends pixels to the native width and percentages to data-image-width', () => {
    expect(imageAttrMarkup({ widthPx: 320 })).toEqual({ width: '320' })
    expect(imageAttrMarkup({ widthPct: 33 })).toEqual({ 'data-image-width': '33' })
  })

  it('carries an explicit height twice, once for CSS to win back', () => {
    expect(imageAttrMarkup({ heightPx: 200 })).toEqual({ height: '200', 'data-image-height': '200' })
  })

  it('only lands on CSS for multiples of five plus the two thirds', () => {
    expect([5, 25, 33, 50, 66, 100].every(isImageWidthPercent)).toBe(true)
    expect([0, 4, 37, 105, 33.3].every(isImageWidthPercent)).toBe(false)
  })
})

describe('image attributes in the rendered note', () => {
  it('writes the group as attributes and leaves no inline style behind', () => {
    const image = imageOf('![cat](/api/files/a.png){width=50% align=center border}')
    expect(image?.dataset.imageWidth).toBe('50')
    expect(image?.dataset.imageAlign).toBe('center')
    expect(image?.dataset.imageBorder).toBe('1')
    expect(image?.getAttribute('style')).toBeNull()
    expect(image?.getAttribute('alt')).toBe('cat')
  })

  it('moves the Cherry flags out of the alt and onto the image', () => {
    const image = imageOf('![a dog#100px#left#B#S#R](/api/files/dog.png)')
    expect(image?.getAttribute('alt')).toBe('a dog')
    expect(image?.getAttribute('width')).toBe('100')
    expect(image?.dataset.imageAlign).toBe('left')
    expect(image?.dataset.imageBorder).toBe('1')
    expect(image?.dataset.imageShadow).toBe('1')
    expect(image?.dataset.imageRadius).toBe('1')
  })

  it('keeps an unrenderable percentage visible instead of picking a step for it', () => {
    expect(imageOf('![cat](/api/files/a.png){width=37%}')?.dataset.imageWidth).toBeUndefined()
    expect(textOf('![cat](/api/files/a.png){width=37%}')).toContain('{width=37%}')
  })

  it('prefers the group over the alt flags when both spell the same key', () => {
    const image = imageOf('![cat#100px#left](/api/files/a.png){align=center}')
    expect(image?.dataset.imageAlign).toBe('center')
    expect(image?.getAttribute('width')).toBe('100')
  })
})

describe('image attributes: where a rendered image came from', () => {
  it('numbers the images of one paragraph so a write can pick the right one', () => {
    const template = document.createElement('template')
    template.innerHTML = renderMarkdown('![one](/api/files/1.png) ![two](/api/files/2.png)').html
    const images = [...template.content.querySelectorAll('img')]
    expect(images.map((image) => image.dataset.imageIndex)).toEqual(['0', '1'])
  })

  it('stamps the source line of the paragraph the image sits in', () => {
    expect(imageOf('title\n\n![cat](/api/files/a.png){width=50%}')?.dataset.imageLine).toBe('2')
    expect(imageOf('- item\n- ![cat](/api/files/a.png){width=50%}')?.dataset.imageLine).toBe('1')
  })

  it('follows a soft-wrapped paragraph down to the line the image is really on', () => {
    const template = document.createElement('template')
    template.innerHTML = renderMarkdown('![one](/api/files/1.png)\n![two](/api/files/2.png)').html
    const images = [...template.content.querySelectorAll('img')]
    expect(images.map((image) => [image.dataset.imageLine, image.dataset.imageIndex])).toEqual([['0', '0'], ['1', '0']])
  })

  it('leaves the spelling inside a code fence alone', () => {
    expect(textOf('```\n![a](b.png){width=50%}\n```')).toContain('{width=50%}')
  })

  it('strips only the flag from a caption that carries formatting', () => {
    const image = imageOf('![**bold**#100px](/api/files/a.png)')
    expect(image?.getAttribute('alt')).toBe('bold')
    expect(image?.getAttribute('width')).toBe('100')
  })
})
