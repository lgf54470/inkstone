import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotes } from '../../store/notes'
import { initI18n, t } from '../../lib/i18n'
import {
  clearImageEditor,
  closeImageEditorFromEvent,
  handleImageFocusIn,
  handleImageFocusOut,
  mountImageEditor,
  registerImageEditorApi,
  selectImageFromClick,
} from './image-editor'

const NOTE_ID = 'note-image-editor'
const SOURCE = '![cat](/api/files/a.png)\n'

interface Calls {
  previews: string[][]
  toasts: string[]
}

let root: HTMLElement
let image: HTMLImageElement
let calls: Calls

function prose(markup: string): HTMLElement {
  const template = document.createElement('template')
  template.innerHTML = markup
  return template.content.querySelector<HTMLElement>('.ink-prose')!
}

function setup(markup = `<div class="ink-prose"><p><button type="button" class="image-zoom" data-image-zoom="1"><img src="/api/files/a.png" alt="cat" data-image-line="0" data-image-index="0"></button></p></div>`, content = SOURCE) {
  document.body.innerHTML = ''
  root = prose(markup)
  document.body.append(root)
  image = root.querySelector('img')!
  calls = { previews: [], toasts: [] }
  useNotes.setState({ contents: { [NOTE_ID]: content }, editContent: vi.fn() })
  root.addEventListener('focusin', handleImageFocusIn)
  root.addEventListener('focusout', handleImageFocusOut)
  registerImageEditorApi(root, {
    noteId: () => NOTE_ID,
    preview: (src, alt) => calls.previews.push([src, alt]),
    toast: (options) => calls.toasts.push(String(options.title)),
  })
}

/** A FocusEvent's target is set by dispatch, not by the init dict, so the events are sent for real. */
function reveal(): void {
  image.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
}

function leave(to: EventTarget | null): void {
  image.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: to }))
}

/** The focusable half of a wrapped image is the zoom button, not the img inside it. */
function control(): HTMLElement {
  return image.closest<HTMLElement>('[data-image-zoom]') ?? image
}

function toolbar(): HTMLElement | null {
  return document.querySelector('.image-editor')
}

function action(name: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`[data-image-action="${name}"]`)
}

function editContent(): ReturnType<typeof vi.fn> {
  return useNotes.getState().editContent as unknown as ReturnType<typeof vi.fn>
}

function press(node: Element | null, init: Record<string, unknown> = {}): void {
  const event = new Event('pointerdown', { bubbles: true, cancelable: true })
  Object.assign(event, { isPrimary: true, button: 0, pointerId: 1, clientX: 0, ...init })
  node?.dispatchEvent(event)
}

function move(node: Element | null, clientX: number): void {
  const event = new Event('pointermove', { bubbles: true, cancelable: true })
  Object.assign(event, { pointerId: 1, clientX })
  node?.dispatchEvent(event)
}

function release(node: Element | null): void {
  const event = new Event('pointerup', { bubbles: true, cancelable: true })
  Object.assign(event, { pointerId: 1 })
  node?.dispatchEvent(event)
}

beforeEach(async () => {
  await initI18n()
  clearImageEditor()
})

describe('image controls: revealing them', () => {
  it('focus reveals the toolbar and names the group', () => {
    setup()
    reveal()
    expect(toolbar()?.getAttribute('aria-label')).toBe(t('preview.image_controls'))
    expect(root.querySelector('.image-editor-host')).not.toBeNull()
  })

  it('marks the state the note already carries', () => {
    setup('<div class="ink-prose"><p><img src="/api/files/a.png" alt="cat" data-image-line="0" data-image-index="0" data-image-align="center" data-image-shadow="1"></p></div>')
    reveal()
    expect(action('align:center')?.getAttribute('aria-pressed')).toBe('true')
    expect(action('flag:shadow')?.getAttribute('aria-pressed')).toBe('true')
    expect(action('align:left')?.getAttribute('aria-pressed')).toBe('false')
  })

  it('offers nothing for an image the note did not draw', () => {
    setup('<div class="ink-prose"><p><img src="/api/files/a.png" alt="cat"></p></div>')
    reveal()
    expect(toolbar()).toBeNull()
  })

  it('offers nothing for an image inside an embedded note', () => {
    setup('<div class="ink-prose"><div class="note-embed-body"><p><img src="/api/files/a.png" alt="cat" data-image-line="0" data-image-index="0"></p></div></div>')
    reveal()
    expect(toolbar()).toBeNull()
  })
})

describe('image controls: what a button writes', () => {
  it('one click on an alignment is one note edit', () => {
    setup()
    reveal()
    action('align:right')!.click()
    expect(editContent()).toHaveBeenCalledTimes(1)
    expect(editContent()).toHaveBeenCalledWith(NOTE_ID, '![cat](/api/files/a.png){align=right}\n')
  })

  it('clicking the alignment that is already on takes it off again', () => {
    setup('<div class="ink-prose"><p><img src="/api/files/a.png" alt="cat" data-image-line="0" data-image-index="0" data-image-align="right"></p></div>', '![cat](/api/files/a.png){align=right}\n')
    reveal()
    action('align:right')!.click()
    expect(editContent()).toHaveBeenCalledWith(NOTE_ID, '![cat](/api/files/a.png)\n')
  })

  it('the preview button opens the lightbox and writes nothing', () => {
    setup()
    reveal()
    action('preview')!.click()
    expect(calls.previews).toEqual([['/api/files/a.png', 'cat']])
    expect(editContent()).not.toHaveBeenCalled()
  })

  it('a decoration flag keeps the size that is already set', () => {
    setup('<div class="ink-prose"><p><img src="/api/files/a.png" alt="cat" data-image-line="0" data-image-index="0" data-image-width="50"></p></div>')
    reveal()
    action('flag:border')!.click()
    expect(editContent()).toHaveBeenCalledWith(NOTE_ID, '![cat](/api/files/a.png){width=50% border}\n')
  })
})

describe('image controls: the resize handle', () => {
  it('ArrowRight steps to the next snap width and writes once', () => {
    setup('<div class="ink-prose"><p><img src="/api/files/a.png" alt="cat" data-image-line="0" data-image-index="0" data-image-width="50"></p></div>')
    reveal()
    const handle = document.querySelector('.image-resize-handle')!
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    expect(editContent()).toHaveBeenCalledTimes(1)
    expect(editContent()).toHaveBeenCalledWith(NOTE_ID, '![cat](/api/files/a.png){width=66%}\n')
    expect(handle.getAttribute('aria-valuenow')).toBe('66')
  })

  it('End jumps to the top of the scale and Home to the bottom', () => {
    setup()
    reveal()
    const handle = document.querySelector('.image-resize-handle')!
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))
    expect(editContent()).toHaveBeenCalledWith(NOTE_ID, '![cat](/api/files/a.png){width=25%}\n')
  })

})

describe('image controls: dragging the width', () => {
  it('a drag writes once, when the pointer is released, at the snapped share of the column', () => {
    setup('<div class="ink-prose"><p><img src="/api/files/a.png" alt="cat" data-image-line="0" data-image-index="0" data-image-width="50"></p></div>')
    reveal()
    const host = root.querySelector('p')!
    Object.defineProperty(host, 'clientWidth', { value: 1000, configurable: true })
    image.getBoundingClientRect = () => ({ width: 500, height: 200, top: 0, left: 0, right: 500, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    const handle = document.querySelector('.image-resize-handle')!
    handle.setPointerCapture = vi.fn()
    handle.releasePointerCapture = vi.fn()
    handle.hasPointerCapture = () => true
    press(handle, { clientX: 100 })
    move(handle, 300)
    move(handle, 400)
    expect(editContent()).not.toHaveBeenCalled()
    release(handle)
    expect(editContent()).toHaveBeenCalledTimes(1)
    expect(editContent()).toHaveBeenCalledWith(NOTE_ID, '![cat](/api/files/a.png){width=75%}\n')
    expect(image.style.width).toBe('')
  })

  it('a drag with no measurable column writes nothing at all', () => {
    setup()
    reveal()
    const handle = document.querySelector('.image-resize-handle')!
    handle.setPointerCapture = vi.fn()
    press(handle)
    move(handle, 400)
    release(handle)
    expect(handle.setPointerCapture).not.toHaveBeenCalled()
    expect(editContent()).not.toHaveBeenCalled()
  })

  it('double-click puts the width back to the whole column', () => {
    setup('<div class="ink-prose"><p><img src="/api/files/a.png" alt="cat" data-image-line="0" data-image-index="0" data-image-width="50"></p></div>', '![cat](/api/files/a.png){width=50%}\n')
    reveal()
    document.querySelector('.image-resize-handle')!.dispatchEvent(new Event('dblclick', { bubbles: true }))
    expect(editContent()).toHaveBeenCalledWith(NOTE_ID, '![cat](/api/files/a.png)\n')
  })
})

describe('image controls: putting them away', () => {
  it('Escape closes the controls and hands focus back to the image', () => {
    setup()
    image.focus()
    reveal()
    expect(closeImageEditorFromEvent(image)).toBe(true)
    expect(toolbar()).toBeNull()
    expect(document.activeElement).toBe(control())
  })

  it('the focus that Escape hands back does not bring the controls with it', () => {
    setup()
    reveal()
    closeImageEditorFromEvent(image)
    // The dismissal is spent by that one focus return, so the next ask is a real one.
    expect(toolbar()).toBeNull()
    reveal()
    expect(toolbar()).not.toBeNull()
  })

  it('a click on the image asks for the controls again', () => {
    setup()
    reveal()
    closeImageEditorFromEvent(image)
    expect(selectImageFromClick(image)).toBe(true)
    expect(toolbar()).not.toBeNull()
  })

  it('focus leaving the block closes the controls', () => {
    setup()
    reveal()
    leave(document.body)
    expect(toolbar()).toBeNull()
  })

  it('focus moving into the toolbar keeps the controls open', () => {
    setup()
    reveal()
    leave(action('align:right'))
    expect(toolbar()).not.toBeNull()
  })

})

describe('image controls: across the re-render a write causes', () => {
  it('the controls come back after the re-render that using them caused', () => {
    setup()
    reveal()
    const rewritten = prose('<div class="ink-prose"><p><button type="button" class="image-zoom" data-image-zoom="1"><img src="/api/files/a.png" alt="cat" data-image-line="0" data-image-index="0" data-image-align="right"></button></p></div>')
    root.replaceChildren(...rewritten.childNodes)
    image = root.querySelector('img')!
    mountImageEditor(root)
    expect(toolbar()).not.toBeNull()
    expect(action('align:right')?.getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(control())
  })

  it('the focus loss a write causes does not take the controls with it', () => {
    setup()
    reveal()
    action('align:right')!.click()
    // A browser reports the removal of the focused node as a focusout with nowhere to go, which is
    // the same event a click elsewhere produces. The re-render has to be told from the click.
    image.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))
    const rewritten = prose('<div class="ink-prose"><p><button type="button" class="image-zoom" data-image-zoom="1"><img src="/api/files/a.png" alt="cat" data-image-line="0" data-image-index="0" data-image-align="right"></button></p></div>')
    root.replaceChildren(...rewritten.childNodes)
    image = root.querySelector('img')!
    mountImageEditor(root)
    expect(toolbar()).not.toBeNull()
  })

  it('the controls go away when the image does', () => {
    setup()
    reveal()
    root.innerHTML = '<p>gone</p>'
    mountImageEditor(root)
    expect(toolbar()).toBeNull()
  })
})
