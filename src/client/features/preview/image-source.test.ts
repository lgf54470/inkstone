import { describe, expect, it } from 'vitest'
import type { ImageAttrs } from '../../lib/markdown/renderer'
import { imageRefOf, updateImageAttrsAtSource } from './image-source'

function write(content: string, line: number, index: number, src: string, attrs: ImageAttrs): string | null {
  return updateImageAttrsAtSource(content, { line, index, src }, () => attrs)
}

describe('image write-back: the common spellings', () => {
  it('adds a group to a plain image', () => {
    expect(write('![cat](/api/files/a.png)', 0, 0, '/api/files/a.png', { widthPct: 50 }))
      .toBe('![cat](/api/files/a.png){width=50%}')
  })

  it('migrates the Cherry flags out of the alt in the same edit', () => {
    const content = '![cat#100px#left](/api/files/a.png)'
    const next = updateImageAttrsAtSource(
      content,
      { line: 0, index: 0, src: '/api/files/a.png' },
      (attrs) => ({ ...attrs, align: 'center' as const }),
    )
    expect(next).toBe('![cat](/api/files/a.png){width=100px align=center}')
  })

  it('replaces the group that is already there', () => {
    expect(write('![cat](a.png){width=25%}', 0, 0, 'a.png', { widthPct: 50 }))
      .toBe('![cat](a.png){width=50%}')
  })

  it('drops the group when nothing is left to say', () => {
    expect(write('![cat](a.png){width=50%}', 0, 0, 'a.png', {})).toBe('![cat](a.png)')
  })

  it('keeps the title where it was', () => {
    expect(write('![cat](a.png "Meow"){width=50%}', 0, 0, 'a.png', { widthPct: 25 }))
      .toBe('![cat](a.png "Meow"){width=25%}')
  })

  it('keeps an angle-bracket destination', () => {
    expect(write('![cat](<a b.png>)', 0, 0, 'a b.png', { widthPct: 50 }))
      .toBe('![cat](<a b.png>){width=50%}')
  })

  it('keeps a destination that holds parentheses', () => {
    expect(write('![cat](/api/files/a(1).png)', 0, 0, '/api/files/a(1).png', { widthPct: 50 }))
      .toBe('![cat](/api/files/a(1).png){width=50%}')
  })
})

describe('image write-back: which image', () => {
  it('changes only the numbered image of the line', () => {
    const content = '![one](a.png) ![two](b.png)'
    expect(write(content, 0, 1, 'b.png', { widthPct: 50 })).toBe('![one](a.png) ![two](b.png){width=50%}')
  })

  it('finds the image on the second line of a soft-wrapped paragraph', () => {
    const content = '![one](a.png)\n![two](b.png)'
    expect(write(content, 1, 0, 'b.png', { widthPct: 50 })).toBe('![one](a.png)\n![two](b.png){width=50%}')
  })

  it('follows the image down when the paragraph moved, while its src is unique', () => {
    const content = 'intro\n\n![cat](a.png)'
    expect(write(content, 0, 0, 'a.png', { widthPct: 50 })).toBe('intro\n\n![cat](a.png){width=50%}')
  })

  it('refuses when two images share a src and the recorded line no longer holds', () => {
    expect(write('![cat](a.png)\n\n![cat](a.png)', 5, 0, 'a.png', { widthPct: 50 })).toBeNull()
  })

  it('refuses when the src is gone', () => {
    expect(write('![cat](a.png)', 0, 0, 'gone.png', { widthPct: 50 })).toBeNull()
  })

  it('refuses to stack a group next to one it could not parse', () => {
    expect(write('![cat](a.png){width=37%}', 0, 0, 'a.png', { widthPct: 50 })).toBeNull()
  })
})

describe('image write-back: what it leaves alone', () => {
  it('skips an image written inside inline code', () => {
    expect(write('Use `![cat](a.png)` here', 0, 0, 'a.png', { widthPct: 50 })).toBeNull()
  })

  it('skips an image inside a code fence', () => {
    expect(write('```\n![cat](a.png)\n```', 1, 0, 'a.png', { widthPct: 50 })).toBeNull()
  })

  it('skips an image in an indented code block', () => {
    expect(write('    ![cat](a.png)', 0, 0, 'a.png', { widthPct: 50 })).toBeNull()
  })

  it('keeps every other line and the note’s CRLF endings', () => {
    const content = 'a\r\n![cat](x.png)\r\nb'
    expect(write(content, 1, 0, 'x.png', { widthPct: 50 })).toBe('a\r\n![cat](x.png){width=50%}\r\nb')
  })

  it('keeps the trailing newline of the note', () => {
    expect(write('![cat](x.png)\n', 0, 0, 'x.png', { widthPct: 50 })).toBe('![cat](x.png){width=50%}\n')
  })
})

describe('image identity from the rendered node', () => {
  function nodeOf(html: string): HTMLElement {
    const template = document.createElement('template')
    template.innerHTML = html
    return template.content.querySelector('img')!
  }

  it('reads the line, the number and the src the renderer stamped', () => {
    expect(imageRefOf(nodeOf('<img src="/api/files/a.png" data-image-line="4" data-image-index="1">')))
      .toEqual({ line: 4, index: 1, src: '/api/files/a.png' })
  })

  it('refuses a node that never came from a note line', () => {
    expect(imageRefOf(nodeOf('<img src="/api/files/a.png">'))).toBeNull()
    expect(imageRefOf(nodeOf('<img data-image-line="0" data-image-index="0">'))).toBeNull()
  })
})
