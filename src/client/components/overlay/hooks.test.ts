import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement, useRef, useState } from 'react'
import { renderElement } from '../../lib/test-render'
import { useDialogFocus } from './hooks'

/**
 * Dialog harness for the focus-return contract: the opener stays mounted under
 * the open dialog (the preview with its block buttons keeps rendering under the
 * full screen mind map), and the panel only exists while open.
 */
function Harness(props: { openerProps?: Record<string, string> }) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  useDialogFocus(open, panelRef)
  return createElement(
    'div',
    null,
    createElement('button', { ...props.openerProps, onClick: () => setOpen(true) }, 'open'),
    open
      ? createElement('div', { ref: panelRef, role: 'dialog' }, createElement('button', { onClick: () => setOpen(false) }, 'close'))
      : null,
  )
}

function openDialog(openerProps?: Record<string, string>): { close: () => Promise<void> } {
  const rendered = renderElement(createElement(Harness, { openerProps }))
  const opener = rendered.container.querySelector<HTMLButtonElement>('button')!
  act(() => {
    opener.focus()
    opener.click()
  })
  return {
    close: async () => {
      await act(async () => {
        rendered.container.querySelector<HTMLButtonElement>('[role="dialog"] button')!.click()
      })
    },
  }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('useDialogFocus focus return', () => {
  it('returns focus to the opener that is still connected', async () => {
    const dialog = openDialog()
    await dialog.close()
    expect(document.activeElement?.textContent).toBe('open')
  })

  it('resolves the re-rendered opener by its boolean-style data attribute', async () => {
    // The mind map block's fullscreen button renders `data-mindmap-fullscreen`
    // as an empty value; a note edit under the overlay replaces that button, so
    // focus must land on its successor rather than fall back into the panel.
    const dialog = openDialog({ 'data-mindmap-fullscreen': '' })
    const stale = document.querySelector('button[data-mindmap-fullscreen]')!
    const fresh = stale.cloneNode(true) as HTMLElement
    act(() => {
      stale.replaceWith(fresh)
    })

    await dialog.close()
    expect(document.activeElement?.hasAttribute('data-mindmap-fullscreen')).toBe(true)
  })

  it('falls back safely when neither the opener nor a successor exists', async () => {
    const dialog = openDialog()
    act(() => {
      document.querySelector('button[data-mindmap-fullscreen]')?.remove()
      document.querySelector('button')?.remove()
    })
    await dialog.close()
    // No crash and no stray focus: every candidate is gone from the document.
    expect(document.activeElement).toBe(document.body)
  })
})
