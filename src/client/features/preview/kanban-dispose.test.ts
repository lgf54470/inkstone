/**
 * A board open in full screen outlives its own fence.
 *
 * The overlay hosts the live instance the inline block mounted — the element is moved, never copied —
 * and the registry disposes that instance when the note stops holding the block: deleting the fence,
 * or re-rendering the preview from a document without it. Disposal tore the React root down but left
 * the overlay standing on an empty stage, with the reader looking at a blank dialog and no way to
 * learn why (review K-04). Both ends are asserted here: the entry reports that it is gone, and the
 * preview pane closes the overlay and says so — while a pane that is itself going away stays quiet.
 */
import { act, createElement, useRef, type ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { initI18n, t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { renderMarkdown } from '../../lib/markdown/renderer'
import { registerFenceBodies } from '../../lib/markdown/fence-bodies'
import { useUi } from '../../store/ui'
import { useKanbanBlocks } from './use-kanban-blocks'

const SCOPE = 'kanban-dispose-test'

beforeAll(async () => {
  await initI18n()
})

afterEach(() => {
  useUi.setState({ toasts: [] })
  document.body.replaceChildren()
})

const BOARD_DOC = ['# Title', '', '```kanban', '## To Do', '- [ ] First Task', '```', '', 'tail'].join('\n')
const NO_BOARD_DOC = ['# Title', '', 'No board in this note.', '', 'tail'].join('\n')

type BlocksApi = ReturnType<typeof useKanbanBlocks>

/** Drives the real hook the preview pane uses, so the assertions cover the wiring and not a stub. */
function Probe({ doc, bind }: { doc: string; bind: (api: BlocksApi) => void }): ReactNode {
  const hostRef = useRef<HTMLDivElement>(null)
  const rendered = renderMarkdown(doc)
  bind(useKanbanBlocks({
    scope: SCOPE,
    noteId: 'note-1',
    hostRef,
    committedHtml: rendered.html,
    fences: rendered.fences,
  }))
  return createElement('div', {
    ref: (node: HTMLDivElement | null) => {
      if (!node) {
        hostRef.current = null
        return
      }
      // The markup and its bodies live on the host before the layout effect mounts anything into it.
      node.innerHTML = rendered.html
      registerFenceBodies(node, rendered.fences)
      hostRef.current = node
    },
  })
}

/** Opens the block's own full screen session the way the pane's button does. */
function openBlock(api: () => BlocksApi) {
  const node = document.querySelector<HTMLElement>('[data-kanban]')!
  act(() => { api().openFullscreen(node) })
  const session = api().fullscreen?.session
  expect(session, 'the block never opened a full screen session').toBeDefined()
  return session!
}

async function settle(): Promise<void> {
  await act(async () => { await Promise.resolve() })
}

describe('a board that leaves the note while open in full screen', () => {
  it('reports the instance gone once the document no longer holds the block', async () => {
    let current: BlocksApi | null = null
    const rendered = renderElement(createElement(Probe, { doc: BOARD_DOC, bind: (api) => { current = api } }))
    await settle()
    const session = openBlock(() => current!)
    expect(session.isAlive()).toBe(true)

    rendered.rerender(createElement(Probe, { doc: NO_BOARD_DOC, bind: (api) => { current = api } }))
    await settle()
    expect(session.isAlive(), 'a disposed board still claimed to be alive').toBe(false)

    rendered.unmount()
  })

})

describe('the container of a board that is gone', () => {
  it('is never pushed back into the note by the overlay’s late cleanup', async () => {
    let current: BlocksApi | null = null
    const rendered = renderElement(createElement(Probe, { doc: BOARD_DOC, bind: (api) => { current = api } }))
    await settle()
    const session = openBlock(() => current!)
    const placeholder = document.querySelector<HTMLElement>('[data-kanban-placeholder]')!
    const canvas = placeholder.querySelector<HTMLElement>('[data-kanban-canvas]')!
    // What the overlay does on open: the live instance is moved onto its stage, never copied.
    const stage = document.createElement('div')
    document.body.append(stage)
    act(() => { session.moveInto(stage) })
    expect(stage.contains(canvas)).toBe(true)

    rendered.rerender(createElement(Probe, { doc: NO_BOARD_DOC, bind: (api) => { current = api } }))
    await settle()
    // The overlay's own effect cleanup runs moveBack after a close, and the board may already be gone
    // by then: a container that has been torn down must not reappear in the note it left.
    act(() => { session.moveBack() })
    expect(placeholder.contains(canvas), 'a disposed board was moved back into the note').toBe(false)
    expect(stage.contains(canvas), 'the dead container was moved out from under the closing overlay').toBe(true)

    rendered.unmount()
  })
})

describe('the preview pane watching its open board', () => {
  it('closes the overlay and says why when the board is pruned out of the document', async () => {
    let current: BlocksApi | null = null
    const rendered = renderElement(createElement(Probe, { doc: BOARD_DOC, bind: (api) => { current = api } }))
    await settle()
    openBlock(() => current!)
    expect(current!.fullscreen).not.toBeNull()

    rendered.rerender(createElement(Probe, { doc: NO_BOARD_DOC, bind: (api) => { current = api } }))
    await settle()

    expect(current!.fullscreen, 'the overlay stayed open over a board that no longer exists').toBeNull()
    expect(useUi.getState().toasts.at(-1)?.title).toBe(t('preview.kanban_board_removed'))

    rendered.unmount()
  })

  it('stays quiet when the pane itself is going away', async () => {
    let current: BlocksApi | null = null
    const rendered = renderElement(createElement(Probe, { doc: BOARD_DOC, bind: (api) => { current = api } }))
    await settle()
    openBlock(() => current!)

    rendered.unmount()
    await settle()

    expect(useUi.getState().toasts, 'leaving the note announced a removal that did not happen').toHaveLength(0)
  })
})
