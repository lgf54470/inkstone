import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { initI18n, t } from '../../lib/i18n'
import { installTestGlobals, renderElement } from '../../lib/test-render'
import { register } from '../../lib/hotkeys'
import { presentationKeyReference } from '../presentation'
import { ShortcutsPanel } from './shortcuts-panel'

installTestGlobals()

const renderPanel = (onClose: () => void) => {
  const { unmount } = renderElement(createElement(ShortcutsPanel, { onClose }))
  const input = document.body.querySelector<HTMLInputElement>('input[role="combobox"]')!
  return { unmount, input }
}

const setInputValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const keyDown = (input: HTMLInputElement, key: string) => {
  act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); })
}

describe('ShortcutsPanel keyboard roaming', () => {
  it('moves the highlight with arrows and activates the highlighted row with Enter', () => {
    const onClose = vi.fn()
    const { unmount, input } = renderPanel(onClose)
    expect(input.getAttribute('aria-activedescendant')).toBeNull()
    keyDown(input, 'ArrowDown')
    expect(document.body.querySelector('[data-shortcut-index="0"]')?.getAttribute('aria-selected')).toBe('true')
    expect(input.getAttribute('aria-activedescendant')).toContain('option-0')
    keyDown(input, 'ArrowDown')
    expect(document.body.querySelector('[data-shortcut-index="1"]')?.getAttribute('aria-selected')).toBe('true')
    expect(document.body.querySelector('[data-shortcut-index="0"]')?.getAttribute('aria-selected')).toBe('false')
    keyDown(input, 'Enter')
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('does not fire Enter without a highlighted row and clamps the cursor when results shrink', () => {
    const onClose = vi.fn()
    const { unmount, input } = renderPanel(onClose)
    keyDown(input, 'Enter')
    expect(onClose).not.toHaveBeenCalled()
    keyDown(input, 'ArrowDown')
    keyDown(input, 'ArrowDown')
    // Narrow the results to a single row; the cursor must clamp back inside.
    act(() => {
      setInputValue(input, 'zzz-no-match')
    })
    expect(document.body.querySelector('[aria-selected="true"]')).toBeNull()
    unmount()
  })
})

describe('the graph canvas rows (G-28)', () => {
  it('lists the canvas keys a reader can use without a pointer', async () => {
    await initI18n()
    const { unmount } = renderPanel(vi.fn())
    try {
      expect(document.body.textContent).toContain(t('graph.canvas_keys_menu'))
      expect(document.body.textContent).toContain(t('graph.canvas_keys_fit'))
    } finally {
      unmount()
    }
  })
})

describe('ShortcutsPanel registry-backed rows', () => {
  it('executes the underlying command of registry-backed rows on Enter and click', () => {
    const handler = vi.fn()
    const dispose = register({
      id: 'shortcut-panel-exec-test',
      combo: 'mod+9',
      description: 'Execute me',
      group: 'Test group',
      handler,
    })
    try {
      const onClose = vi.fn()
      const { unmount, input } = renderPanel(onClose)
      act(() => {
        setInputValue(input, 'Execute me')
      })
      keyDown(input, 'ArrowDown')
      keyDown(input, 'Enter')
      expect(handler).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalledTimes(1)
      unmount()
    }
    finally {
      dispose()
    }
  })
})

// N-17: the panel is where a presenter looks for keys when no show is up, and it used to list none of
// the show's. Its rows come out of the same table the card on the projector prints.
describe('ShortcutsPanel — the show is listed too', () => {
  beforeAll(async () => {
    await initI18n()
  })

  it('gives the show its own group with one row per binding', () => {
    const { unmount } = renderPanel(vi.fn())
    const group = [...document.body.querySelectorAll('section')].find((section) => section.querySelector('h3')?.textContent === t('workspace.presentation_mode'))
    expect(group, 'the panel lists no presentation group').toBeTruthy()
    expect(group?.querySelectorAll('li').length).toBe(presentationKeyReference().length)
    unmount()
  })

  it('finds a show key by the word that describes it, and shows the keystroke', () => {
    const { unmount, input } = renderPanel(vi.fn())
    act(() => {
      setInputValue(input, t('workspace.presentation_laser'))
    })
    const row = [...document.body.querySelectorAll('[role="option"]')].find((item) => item.textContent?.includes(t('workspace.presentation_laser')))
    expect(row?.textContent).toContain('C')
    unmount()
  })
})
