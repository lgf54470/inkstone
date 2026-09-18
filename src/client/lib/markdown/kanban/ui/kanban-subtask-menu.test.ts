import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement, createRef } from 'react'
import { act } from 'react'
import { initI18n, t } from '../../../i18n'
import { useUi } from '../../../../store/ui'
import { renderElement } from '../../../test-render'
import { KanbanSubtaskMenu } from './kanban-subtask-menu'
import type { KanbanSubtask } from '../types'

const subtask: KanbanSubtask = { id: 's1', title: 'Write the spec', completed: false }

function mountMenu(overrides: Partial<Record<string, () => void>> = {}) {
  const onClose = overrides.onClose ?? vi.fn()
  const rendered = renderElement(
    createElement(KanbanSubtaskMenu, {
      open: true,
      subtask,
      anchorRef: createRef<HTMLElement>(),
      onClose,
      onDuplicate: vi.fn(),
      onConvertToItem: vi.fn(),
      onDelete: vi.fn(),
      ...overrides,
    }),
  )
  const copyButton = [...rendered.container.querySelectorAll('button')].find(
    (b) => b.textContent === t('preview.kanban_copy_subitem_name'),
  )
  return { rendered, onClose, copyButton: copyButton! }
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
}

async function clickCopy() {
  const { rendered, onClose, copyButton } = mountMenu()
  await act(async () => {
    copyButton.click()
  })
  return { rendered, onClose, copyButton }
}

describe('kanban subtask menu copy name', () => {
  beforeEach(() => {
    useUi.setState({ toasts: [] })
    delete (navigator as { clipboard?: unknown }).clipboard
  })

  beforeAll(async () => {
    await initI18n()
  })

  it('copies the subtask title and confirms with a success toast', async () => {
    const writeText = vi.fn(async () => {})
    stubClipboard(writeText)
    const { rendered, onClose } = await clickCopy()
    expect(writeText).toHaveBeenCalledWith('Write the spec')
    expect(onClose).toHaveBeenCalled()
    expect(useUi.getState().toasts.at(-1)).toMatchObject({
      title: t('common.copied'),
      tone: 'success',
    })
    rendered.unmount()
  })

  it('reports a danger toast instead of an unhandled rejection when the write fails', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied')
    })
    stubClipboard(writeText)
    const { rendered } = await clickCopy()
    expect(useUi.getState().toasts.at(-1)).toMatchObject({
      title: t('preview.could_not_copy'),
      tone: 'danger',
    })
    rendered.unmount()
  })

  it('reports a danger toast when no clipboard is available', async () => {
    const { rendered, onClose } = await clickCopy()
    expect(onClose).toHaveBeenCalled()
    expect(useUi.getState().toasts.at(-1)).toMatchObject({
      title: t('preview.could_not_copy'),
      tone: 'danger',
    })
    rendered.unmount()
  })
})
