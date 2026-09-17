import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, createElement, useState } from 'react'
import { initI18n } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { renderMarkdown } from '../../lib/markdown/renderer'
import {
  destroyKanbans,
  mountKanbans,
  openKanbanSession,
  type KanbanSession,
} from '../../lib/markdown/kanban'
import { KanbanFullscreen } from '../../lib/markdown/kanban/ui/kanban-fullscreen'

const SCOPE = 'kanban-fullscreen-test'

beforeAll(async () => {
  await initI18n()
})

afterEach(() => {
  destroyKanbans(SCOPE)
  document.body.replaceChildren()
})

function previewHost(body = '## To Do\n- [ ] First Task'): HTMLElement {
  const host = document.createElement('div')
  host.className = 'ink-prose'
  host.innerHTML = renderMarkdown(['# Title', '', '```kanban', body, '```', '', 'tail'].join('\n')).html
  document.body.append(host)
  return host
}

interface Surface {
  host: HTMLElement
  block: HTMLElement
  session: KanbanSession
  writes: string[]
}

async function mountSurface(): Promise<Surface> {
  const host = previewHost()
  const writes: string[] = []
  await mountKanbans(host, {
    scope: SCOPE,
    noteId: 'note-1',
    dark: false,
    locale: 'en-US',
    editable: true,
    writeBack: (_ref, next) => {
      writes.push(next)
      return 'written'
    },
  })
  const block = host.querySelector<HTMLElement>('[data-kanban]')!
  const session = openKanbanSession(block)!
  return { host, block, session, writes }
}

function Harness({ session }: { session: KanbanSession }) {
  const [open, setOpen] = useState(false)
  return createElement(
    'div',
    null,
    createElement('button', {
      type: 'button',
      'data-kanban-fullscreen-trigger': '',
      onClick: () => setOpen(true),
    }, 'Open Fullscreen'),
    open ? createElement(KanbanFullscreen, {
      session,
      onClose: () => setOpen(false),
    }) : null,
  )
}

describe('kanban full screen mounting and views', () => {
  it('mounts fullscreen modal and renders Kanban view tabs', async () => {
    const surface = await mountSurface()
    const rendered = renderElement(createElement(Harness, { session: surface.session }))

    await act(async () => {
      rendered.container.querySelector<HTMLButtonElement>('[data-kanban-fullscreen-trigger]')!.click()
    })

    const overlay = document.querySelector<HTMLElement>('.kanban-fullscreen')
    expect(overlay).not.toBeNull()
    const boardViewBtn = overlay!.querySelector<HTMLButtonElement>('button[data-view-type="board"]')
    expect(boardViewBtn).not.toBeNull()

    rendered.unmount()
    surface.host.remove()
  })

  it('switches views when clicking view tabs', async () => {
    const surface = await mountSurface()
    const rendered = renderElement(createElement(Harness, { session: surface.session }))

    await act(async () => {
      rendered.container.querySelector<HTMLButtonElement>('[data-kanban-fullscreen-trigger]')!.click()
    })

    const overlay = document.querySelector<HTMLElement>('.kanban-fullscreen')!
    const tableViewBtn = overlay.querySelector<HTMLButtonElement>('button[data-view-type="table"]')
    expect(tableViewBtn).not.toBeNull()
    await act(async () => {
      tableViewBtn!.click()
    })

    const listBtn = overlay.querySelector<HTMLButtonElement>('button[data-view-type="list"]')
    expect(listBtn).not.toBeNull()
    await act(async () => {
      listBtn!.click()
    })

    rendered.unmount()
    surface.host.remove()
  })
})

describe('kanban full screen context menu', () => {
  it('opens dedicated Kanban context menu on right click in fullscreen', async () => {
    const surface = await mountSurface()
    const rendered = renderElement(createElement(Harness, { session: surface.session }))

    await act(async () => {
      rendered.container.querySelector<HTMLButtonElement>('[data-kanban-fullscreen-trigger]')!.click()
    })

    const overlay = document.querySelector<HTMLElement>('.kanban-fullscreen')!
    const board = overlay.querySelector<HTMLElement>('[data-item-id]') || overlay.querySelector<HTMLElement>('main')!

    await act(async () => {
      board.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }))
    })

    const menu = document.querySelector<HTMLElement>('[role="menu"]')
    expect(menu).not.toBeNull()

    rendered.unmount()
    surface.host.remove()
  })
})

describe('kanban full screen close and session updates', () => {
  it('closes on Escape key press and flushes session data', async () => {
    const surface = await mountSurface()
    const rendered = renderElement(createElement(Harness, { session: surface.session }))

    await act(async () => {
      rendered.container.querySelector<HTMLButtonElement>('[data-kanban-fullscreen-trigger]')!.click()
    })
    expect(document.querySelector('.kanban-fullscreen')).not.toBeNull()

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.querySelector('.kanban-fullscreen')).toBeNull()

    rendered.unmount()
    surface.host.remove()
  })

  it('updates data and writes back through the session', async () => {
    const surface = await mountSurface()
    const session = surface.session

    act(() => {
      session.updateData((prev) => ({
        ...prev,
        items: [
          ...prev.items,
          { id: 'item-new', title: 'Newly Added Item', properties: { status: 'todo' } },
        ],
      }))
      session.flush()
    })

    expect(session.getData()?.items.some((i) => i.title === 'Newly Added Item')).toBe(true)
    expect(surface.writes.length).toBeGreaterThan(0)
    expect(surface.writes.at(-1)).toContain('Newly Added Item')

    surface.host.remove()
  })
})
