/**
 * The preview pane is the only production caller that hands a board a description renderer, and it does
 * so through a hook. Nothing in the modal's own tests can tell whether that hand-off happened: a board
 * mounted without it still behaves perfectly in every unit test, it simply never offers the control.
 * So this drives the real hook over a real rendered fence.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, createElement, type RefObject } from 'react'
import { initI18n, t } from '../../lib/i18n'
import { installTestGlobals, renderElement } from '../../lib/test-render'
import { renderMarkdown } from '../../lib/markdown/renderer'
import { destroyKanbans } from '../../lib/markdown/kanban'
import { useKanbanBlocks } from './use-kanban-blocks'

const SCOPE = 'preview-description-wiring'

beforeAll(async () => {
  installTestGlobals()
  await initI18n()
})

afterEach(async () => {
  await act(async () => {
    destroyKanbans(SCOPE)
  })
  document.body.replaceChildren()
})

function Board({ rendered, hostRef }: { rendered: ReturnType<typeof renderMarkdown>; hostRef: RefObject<HTMLDivElement | null> }) {
  useKanbanBlocks({ scope: SCOPE, noteId: 'note-1', hostRef, committedHtml: rendered.html, fences: rendered.fences })
  return createElement('div', {
    ref: hostRef,
    className: 'ink-prose',
    dangerouslySetInnerHTML: { __html: rendered.html },
  })
}

function renderedBoard(): ReturnType<typeof renderMarkdown> {
  const body = JSON.stringify({
    title: 'Sprint',
    items: [{ id: 'item-1', title: 'Ship the board', content: '**bold** claim', properties: { status: 'todo' } }],
  })
  return renderMarkdown(['# Title', '', '```kanban', body, '```'].join('\n'))
}

describe('the preview pane wiring a board to the markdown renderer', () => {
  it('lets a mounted card preview its description through the note pipeline', async () => {
    const hostRef: RefObject<HTMLDivElement | null> = { current: null }
    renderElement(createElement(Board, { rendered: renderedBoard(), hostRef }))
    await act(async () => {})

    const card = document.querySelector<HTMLElement>('[data-item-id]')
    if (!card) throw new Error('the preview pane mounted no board to open')
    await act(async () => {
      // The card is a container of controls (SH-107): its title button is what opens the detail.
      card.querySelector<HTMLButtonElement>('h3 button')!.click()
    })
    const trigger = document.querySelector<HTMLButtonElement>(
      `button[aria-label="${t('preview.kanban_preview_description')}"]`,
    )
    expect(trigger, 'the preview pane passed no description renderer').not.toBeNull()
    await act(async () => {
      trigger!.click()
    })
    expect(document.querySelector<HTMLElement>('[data-kanban-desc-preview] strong')?.textContent).toBe('bold')
  })
})
