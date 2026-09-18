import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../../lib/i18n'
import { deleteKanbanFile, uploadKanbanFile } from '../../../api'
import { installTestGlobals } from '../../../test-render'
import { KanbanFilesCell, KanbanFilesScope } from './kanban-files-cell'
import type { KanbanFile } from '../types'

const mocks = vi.hoisted(() => ({ toast: vi.fn() }))

vi.mock('../../../api', () => ({
  uploadKanbanFile: vi.fn(async (): Promise<KanbanFile> => ({
    id: 'up-1', name: 'a.txt', size: 1, mime: 'text/plain', url: '/api/kanban/file/note-9/up-1-a.txt',
  })),
  deleteKanbanFile: vi.fn(async () => ({ ok: true })),
}))

vi.mock('../../../../store/ui', () => ({
  useUi: { getState: () => ({ toast: mocks.toast }) },
}))

beforeAll(async () => {
  await initI18n()
})

beforeEach(() => {
  vi.mocked(uploadKanbanFile).mockClear()
  vi.mocked(deleteKanbanFile).mockClear()
  mocks.toast.mockClear()
})

const savedFile: KanbanFile = {
  id: 'f-1',
  name: 'report.pdf',
  size: 2048,
  mime: 'application/pdf',
  url: '/api/kanban/file/default/7-report.pdf',
}

function renderCell(files: KanbanFile[], wrapperValue?: string) {
  installTestGlobals()
  const onChangeFiles = vi.fn()
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const cell = createElement(KanbanFilesCell, { files, onChangeFiles })
  act(() => {
    root.render(wrapperValue
      ? createElement(KanbanFilesScope.Provider, { value: wrapperValue }, cell)
      : cell)
  })
  return { container, root, onChangeFiles }
}

function deleteButton(container: HTMLElement): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(`button[title="${t('preview.kanban_delete_file')}"]`)!
}

describe('kanban file delete wiring', () => {
  it('asks the server to delete a same-site file at its stored location', async () => {
    vi.mocked(deleteKanbanFile).mockClear()
    const { container, root, onChangeFiles } = renderCell([savedFile])
    await act(async () => { deleteButton(container).click() })
    expect(onChangeFiles).toHaveBeenNthCalledWith(1, [])
    expect(deleteKanbanFile).toHaveBeenCalledWith('default', '7-report.pdf')
    act(() => root.unmount())
    container.remove()
  })

  it('drops the reference only for a file hosted outside this app', async () => {
    vi.mocked(deleteKanbanFile).mockClear()
    const remote = { ...savedFile, url: 'https://cdn.example.com/a.png' }
    const { container, root, onChangeFiles } = renderCell([remote])
    await act(async () => { deleteButton(container).click() })
    expect(onChangeFiles).toHaveBeenCalledTimes(1)
    expect(deleteKanbanFile).not.toHaveBeenCalled()
    act(() => root.unmount())
    container.remove()
  })

  it('restores the reference and toasts when the server refuses the delete', async () => {
    vi.mocked(deleteKanbanFile).mockRejectedValueOnce(new Error('offline'))
    const { container, root, onChangeFiles } = renderCell([savedFile])
    await act(async () => { deleteButton(container).click() })
    expect(onChangeFiles).toHaveBeenNthCalledWith(2, [savedFile])
    expect(mocks.toast).toHaveBeenCalledTimes(1)
    act(() => root.unmount())
    container.remove()
  })
})

describe('kanban file upload namespace', () => {
  it('uploads into the board namespace from context', async () => {
    const { container, root } = renderCell([], 'note-9')
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', {
      value: [new File(['hi'], 'a.txt', { type: 'text/plain' })],
      configurable: true,
    })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(vi.mocked(uploadKanbanFile).mock.calls[0][1]).toBe('note-9')
    act(() => root.unmount())
    container.remove()
  })

  it('falls back to default when no board namespace is provided', async () => {
    const { container, root } = renderCell([])
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', {
      value: [new File(['hi'], 'a.txt', { type: 'text/plain' })],
      configurable: true,
    })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(vi.mocked(uploadKanbanFile).mock.calls[0][1]).toBe('default')
    act(() => root.unmount())
    container.remove()
  })
})
