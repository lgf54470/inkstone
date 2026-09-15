import { describe, expect, it } from 'vitest'
import { act, createElement, useState } from 'react'
import { renderElement } from '../../lib/test-render'
import { useFocusRestore } from './use-menu'

/**
 * Menu harness for the focus-return contract: closing hands focus back to the opener,
 * unless something else claimed it in the same commit — the prompt a menu action opens
 * mounts then, and its field must keep the caret.
 */
function Harness() {
  const [open, setOpen] = useState(false)
  useFocusRestore(open)
  const close = (claimFocus: boolean) => () => {
    if (claimFocus) document.querySelector<HTMLInputElement>('input')?.focus()
    setOpen(false)
  }
  return createElement(
    'div',
    null,
    createElement('button', { onClick: () => setOpen(true) }, 'open'),
    open
      ? createElement(
          'div',
          { role: 'menu' },
          createElement('button', { onClick: close(false) }, 'close only'),
          createElement('button', { onClick: close(true) }, 'close into a field'),
        )
      : null,
    createElement('input', { 'aria-label': 'name' }),
  )
}

function opened() {
  const rendered = renderElement(createElement(Harness))
  const opener = rendered.container.querySelector('button')!
  act(() => {
    opener.focus()
    opener.click()
  })
  return rendered
}

function menuItem(rendered: { container: HTMLElement }, label: string): HTMLElement {
  const item = [...rendered.container.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find(
    (button) => button.textContent === label,
  )
  return item!
}

describe('menu focus restore', () => {
  it('returns focus to the opener when the menu closed and nothing claimed it', async () => {
    const rendered = opened()
    await act(async () => {
      menuItem(rendered, 'close only').click()
    })
    expect(document.activeElement).toBe(rendered.container.querySelector('button'))
  })

  it('leaves focus alone when a menu action already moved it into a field', async () => {
    const rendered = opened()
    await act(async () => {
      menuItem(rendered, 'close into a field').click()
    })
    expect(document.activeElement).toBe(document.querySelector<HTMLInputElement>('input'))
  })
})
