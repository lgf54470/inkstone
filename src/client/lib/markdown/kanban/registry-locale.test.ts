/**
 * A kanban block is a React root of its own, mounted into markup React did not make, so nothing in
 * the app tree re-renders it when the language changes: its labels only follow the locale if the
 * board itself subscribes. `t()` reads the live locale, which is why a re-render is all it takes —
 * and why the host used to have to smuggle the locale in through a mount option nobody read.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act } from 'react'
import { initI18n, setLocale, t } from '../../i18n'
import { installTestGlobals } from '../../test-render'
import { renderMarkdown } from '../renderer'
import { destroyKanbans, mountKanbans } from './index'

const SCOPE = 'kanban-locale-test'

beforeAll(async () => {
  installTestGlobals()
  await initI18n()
})

afterEach(async () => {
  await act(async () => {
    await setLocale('en-US', false)
    destroyKanbans(SCOPE)
  })
  document.body.replaceChildren()
})

async function mountBoard(): Promise<HTMLElement> {
  const host = document.createElement('div')
  host.className = 'ink-prose'
  host.innerHTML = renderMarkdown(
    ['# Title', '', '```kanban', '## To Do', '- [ ] First Task', '```'].join('\n'),
  ).html
  document.body.append(host)
  await act(async () => {
    await mountKanbans(host, { scope: SCOPE, noteId: 'note-1', editable: true })
  })
  return host
}

function boardText(host: HTMLElement): string {
  const canvas = host.querySelector<HTMLElement>('[data-kanban-canvas]')
  if (!canvas) throw new Error('the kanban block mounted no canvas to draw into')
  return canvas.textContent ?? ''
}

describe('a mounted board follows the language', () => {
  it('repaints its own labels when the locale changes, with no re-mount', async () => {
    const host = await mountBoard()
    const englishLabel = t('preview.kanban_new_item')
    expect(boardText(host)).toContain(englishLabel)

    await act(async () => {
      await setLocale('zh-CN', false)
    })
    expect(boardText(host)).toContain(t('preview.kanban_new_item'))
    expect(boardText(host)).not.toContain(englishLabel)
  })

  it('repaints them back when the locale changes again', async () => {
    const host = await mountBoard()
    const englishLabel = t('preview.kanban_new_item')
    await act(async () => {
      await setLocale('zh-CN', false)
    })
    const chineseLabel = t('preview.kanban_new_item')
    await act(async () => {
      await setLocale('en-US', false)
    })
    expect(chineseLabel).not.toBe(englishLabel)
    expect(boardText(host)).toContain(englishLabel)
    expect(boardText(host)).not.toContain(chineseLabel)
  })

  // The canvas is the board's landmark, and its name is the one string on it React does not render:
  // the host writes it once, when it makes the element, so it used to keep whatever language the
  // block mounted in for as long as the block lived.
  it('re-names the landmark the host created, which nothing re-renders but this tree', async () => {
    const host = await mountBoard()
    const canvas = host.querySelector<HTMLElement>('[data-kanban-canvas]')!
    expect(canvas.getAttribute('aria-label')).toBe(t('preview.kanban'))
    const englishName = canvas.getAttribute('aria-label')

    await act(async () => {
      await setLocale('zh-CN', false)
    })
    expect(canvas.getAttribute('aria-label')).toBe(t('preview.kanban'))
    expect(canvas.getAttribute('aria-label')).not.toBe(englishName)
  })
})
