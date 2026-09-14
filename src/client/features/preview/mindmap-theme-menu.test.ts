/**
 * Where the block header's palette menu lands.
 *
 * The block is the map — a box hundreds of pixels tall — while the control that opens the
 * menu sits in its header, so an anchor that resolves to the wrong one of the two puts the
 * menu at the bottom of the drawing area instead of under the button that was pressed.
 * jsdom lays nothing out, so both boxes are stated here and the menu is read where it would
 * be painted.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { initI18n } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { renderMarkdown } from '../../lib/markdown/renderer'
import { APP_THEME_CHOICE } from '../../lib/markdown/mindmap'
import { MindmapThemeMenu } from './mindmap-theme-menu'

/** The gap the menu leaves under its anchor (see components/overlay/use-menu.ts). */
const MENU_GAP = 5

beforeAll(async () => {
  await initI18n()
})

afterEach(() => {
  document.body.replaceChildren()
})

interface Box {
  top: number
  left: number
  right: number
  bottom: number
}

function box(values: Box): DOMRect {
  return {
    ...values,
    x: values.left,
    y: values.top,
    width: values.right - values.left,
    height: values.bottom - values.top,
    toJSON: () => values,
  } as DOMRect
}

const BLOCK = box({ top: 0, left: 0, right: 900, bottom: 600 })
const BUTTON = box({ top: 16, left: 816, right: 880, bottom: 40 })

/** The block markup the preview renders for one fence, with its header control. */
function blockMarkup(): { block: HTMLElement; button: HTMLButtonElement } {
  const host = document.createElement('div')
  host.innerHTML = renderMarkdown(['# Title', '', '```mindmap', '- Root', '```'].join('\n')).html
  document.body.append(host)
  return {
    block: host.querySelector<HTMLElement>('[data-mindmap]')!,
    button: host.querySelector<HTMLButtonElement>('[data-mindmap-theme-pick]')!,
  }
}

/** Opens the menu the way the preview does, and hands back the row box it painted into. */
function openMenu(block: HTMLElement): { menu: HTMLElement; close: () => void } {
  const rendered = renderElement(createElement(MindmapThemeMenu, {
    state: { node: block, choice: APP_THEME_CHOICE },
    onClose: () => {},
  }))
  return { menu: document.querySelector<HTMLElement>('[role="menu"]')!, close: rendered.unmount }
}

describe('mindmap theme menu placement', () => {
  it('drops from the header control, not from the block', () => {
    const { block, button } = blockMarkup()
    // The two boxes are far apart on purpose: the block runs to the bottom of the drawing
    // area, so a menu anchored to it is nowhere near the button.
    block.getBoundingClientRect = () => BLOCK
    button.getBoundingClientRect = () => BUTTON
    const { menu, close } = openMenu(block)
    const width = Number.parseFloat(menu.style.width)
    expect(Number.parseFloat(menu.style.top)).toBe(BUTTON.bottom + MENU_GAP)
    expect(Number.parseFloat(menu.style.left)).toBe(BUTTON.right - width)
    expect(BUTTON.bottom + MENU_GAP).toBeLessThan(BLOCK.bottom)
    close()
  })

  it('still opens on the block when the header carries no control', () => {
    const { block, button } = blockMarkup()
    // The degraded renders (source fallback, error banner) drop the head controls, so
    // there has to be a box to hang the menu on even then.
    button.remove()
    block.getBoundingClientRect = () => BLOCK
    const { menu, close } = openMenu(block)
    expect(Number.parseFloat(menu.style.top)).toBe(BLOCK.bottom + MENU_GAP)
    close()
  })
})
