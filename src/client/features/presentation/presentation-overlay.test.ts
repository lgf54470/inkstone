import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { usePresentation } from '../../store/presentation'
import { PresentationOverlay } from './presentation-overlay'

beforeEach(() => {
  usePresentation.setState({
    open: true,
    noteId: 'note-ctx-test',
    title: 'Context Menu Test',
    snapshot: '# Slide 1\n\nContent\n\n---\n\n# Slide 2',
    following: false,
    initialSlideIndex: 0,
  })
})

afterEach(() => {
  act(() => {
    usePresentation.setState({ open: false, noteId: null, snapshot: '' })
  })
  document.body.innerHTML = ''
})

function fireContextMenu(target: EventTarget, clientX = 200, clientY = 300): MouseEvent {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

function fireClick(target: EventTarget): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

describe('PresentationOverlay — context menu integration', () => {
  it('intercepts right click on presentation dialog and opens context menu', () => {
    const view = renderElement(createElement(PresentationOverlay))
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()

    const event = fireContextMenu(dialog!, 200, 300)
    expect(event.defaultPrevented).toBe(true)

    const backdrop = document.querySelector('[data-presentation-menu-backdrop]')
    const menu = document.querySelector('[role="menu"]')
    expect(backdrop).toBeTruthy()
    expect(menu).toBeTruthy()

    view.unmount()
  })

  it('closes context menu when clicking outside on the backdrop without penetrating', () => {
    const view = renderElement(createElement(PresentationOverlay))
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()

    fireContextMenu(dialog!, 200, 200)
    const backdrop = document.querySelector('[data-presentation-menu-backdrop]')
    expect(backdrop).toBeTruthy()

    const clickEvent = fireClick(backdrop!)
    expect(clickEvent.defaultPrevented).toBe(true)

    expect(document.querySelector('[data-presentation-menu-backdrop]')).toBeNull()
    view.unmount()
  })
})

describe('PresentationOverlay — context menu repositioning', () => {
  it('re-opens context menu at new position when right clicking elsewhere', () => {
    const view = renderElement(createElement(PresentationOverlay))
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()

    fireContextMenu(dialog!, 100, 100)
    const backdrop = document.querySelector('[data-presentation-menu-backdrop]')
    expect(backdrop).toBeTruthy()

    const reEvent = fireContextMenu(backdrop!, 350, 450)
    expect(reEvent.defaultPrevented).toBe(true)

    const menu = document.querySelector('[role="menu"]')
    expect(menu).toBeTruthy()

    view.unmount()
  })
})

describe('PresentationOverlay — context menu Escape dismiss', () => {
  it('closes only the context menu and keeps presentation open when pressing Escape', () => {
    const view = renderElement(createElement(PresentationOverlay))
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()

    fireContextMenu(dialog!, 150, 150)
    expect(document.querySelector('[data-presentation-menu-backdrop]')).toBeTruthy()
    expect(document.querySelector('[role="menu"]')).toBeTruthy()

    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    act(() => {
      window.dispatchEvent(escEvent)
    })

    expect(document.querySelector('[data-presentation-menu-backdrop]')).toBeNull()
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(usePresentation.getState().open).toBe(true)

    view.unmount()
  })
})

describe('PresentationOverlay — context menu link actions', () => {
  it('extracts link URL and displays link actions when right clicking on anchor element', () => {
    const view = renderElement(createElement(PresentationOverlay))
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()

    const link = document.createElement('a')
    link.setAttribute('href', 'https://github.com/shuaiplus/inkstone')
    link.textContent = 'Project Link'
    dialog!.append(link)

    fireContextMenu(link, 200, 200)

    const menu = document.querySelector('[role="menu"]')
    expect(menu).toBeTruthy()
    const openItem = menu?.querySelector('[data-menu-item="link-open"]')
    const copyItem = menu?.querySelector('[data-menu-item="link-copy"]')
    expect(openItem || menu?.textContent?.includes('link_open') || menu?.textContent?.includes(t('contextmenu.link_open'))).toBeTruthy()
    expect(copyItem || menu?.textContent?.includes('link_copy') || menu?.textContent?.includes(t('contextmenu.link_copy'))).toBeTruthy()

    link.remove()
    view.unmount()
  })
})
