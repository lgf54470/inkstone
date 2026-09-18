/**
 * When a write loses the race against an external edit of the same fence, the
 * board must keep the in-memory edits, say so in the header, and offer retry /
 * discard instead of silently dropping the changes (review #3).
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act } from 'react'
import { initI18n, t } from '../../lib/i18n'
import { installTestGlobals } from '../../lib/test-render'
import { renderMarkdown } from '../../lib/markdown/renderer'
import {
  destroyKanbans,
  flushKanbans,
  mountKanbans,
  type KanbanWriteResult,
} from '../../lib/markdown/kanban'

const SCOPE = 'kanban-unsaved-test'

beforeAll(async () => {
  installTestGlobals()
  await initI18n()
})

afterEach(() => {
  destroyKanbans(SCOPE)
  document.body.replaceChildren()
})

interface Surface {
  host: HTMLElement
  block: HTMLElement
  writes: string[]
  setOutcome: (outcome: KanbanWriteResult) => void
  writeCount: () => number
}

async function mountSurface(): Promise<Surface> {
  const host = document.createElement('div')
  host.className = 'ink-prose'
  host.innerHTML = renderMarkdown('# Title\n\n```kanban\n## To Do\n- [ ] First Task\n```\n\ntail').html
  document.body.append(host)

  const writes: string[] = []
  let outcome: KanbanWriteResult = 'written'
  await mountKanbans(host, {
    scope: SCOPE,
    noteId: 'note-1',
    editable: true,
    writeBack: (_ref, next) => {
      if (outcome === 'written') writes.push(next)
      return outcome
    },
  })
  return {
    host,
    block: host.querySelector<HTMLElement>('[data-kanban]')!,
    writes,
    setOutcome: (next) => {
      outcome = next
    },
    writeCount: () => writes.length,
  }
}

async function renameFirstCard(block: HTMLElement, title: string): Promise<void> {
  await act(async () => {})
  const heading = block.querySelector<HTMLElement>('[data-item-id] h4')!
  await act(async () => {
    heading.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  })
  const input = block.querySelector<HTMLInputElement>('input[data-owns-escape="true"]')!
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, title)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}

async function flush(): Promise<void> {
  await act(async () => {
    flushKanbans(SCOPE)
  })
}

function statusBadge(block: HTMLElement): HTMLElement | null {
  return block.querySelector<HTMLElement>('[data-kanban-write-status]')
}

function statusButton(block: HTMLElement, label: string): HTMLButtonElement | null {
  return statusBadge(block)?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? null
}

describe('kanban conflict write-back', () => {
  it('shows a persistent unsaved state and keeps the edits after a conflict', async () => {
    const surface = await mountSurface()
    surface.setOutcome('conflict')
    await renameFirstCard(surface.block, 'Renamed Task')
    await flush()

    const badge = statusBadge(surface.block)
    expect(badge).not.toBeNull()
    expect(badge!.textContent).toContain(t('preview.kanban_unsaved'))
    expect(statusButton(surface.block, t('common.retry'))).not.toBeNull()
    expect(statusButton(surface.block, t('preview.kanban_discard_changes'))).not.toBeNull()
    expect(surface.block.querySelector('[data-item-id] h4')!.textContent).toBe('Renamed Task')
  })
})

describe('kanban conflict retry', () => {
  it('retry attempts the write again and lands once the fence resolves', async () => {
    const surface = await mountSurface()
    surface.setOutcome('conflict')
    await renameFirstCard(surface.block, 'Renamed Task')
    await flush()

    await act(async () => {
      statusButton(surface.block, t('common.retry'))!.click()
    })
    expect(statusBadge(surface.block)).not.toBeNull()

    surface.setOutcome('written')
    await act(async () => {
      statusButton(surface.block, t('common.retry'))!.click()
    })

    expect(statusBadge(surface.block)).toBeNull()
    expect(surface.writes.at(-1)).toContain('Renamed Task')
  })
})

describe('kanban conflict discard', () => {
  it('discard reverts the board to the last written body without another write', async () => {
    const surface = await mountSurface()
    await renameFirstCard(surface.block, 'Renamed Task')
    await flush()
    expect(surface.writeCount()).toBe(1)

    surface.setOutcome('conflict')
    await renameFirstCard(surface.block, 'Thrown Away')
    await flush()
    expect(statusBadge(surface.block)).not.toBeNull()

    await act(async () => {
      statusButton(surface.block, t('preview.kanban_discard_changes'))!.click()
    })
    await flush()

    expect(statusBadge(surface.block)).toBeNull()
    expect(surface.block.querySelector('[data-item-id] h4')!.textContent).toBe('Renamed Task')
    expect(surface.writeCount()).toBe(1)
  })
})
