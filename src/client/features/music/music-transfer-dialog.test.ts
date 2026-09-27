import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { t } from '../../lib/i18n'
import { DropZone, MusicTransferDialog, UploadPicker } from './music-transfer-dialog'
import { useMusic } from './music-store'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null

async function mountDropZone(onFiles = vi.fn(), onChoose = vi.fn()): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(DropZone, { onFiles, onChoose }))
  })
  return container.querySelector('div') as HTMLElement
}

function dragEvent(type: string, target: EventTarget): void {
  target.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
}

function isOver(node: HTMLElement): boolean {
  return node.className.includes('border-[var(--accent)]')
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

describe('DropZone drag highlight', () => {
  it('stays highlighted while the pointer crosses a child, and clears only on real leave', async () => {
    const node = await mountDropZone()
    const child = node.querySelector('p') as HTMLElement
    await act(async () => {
      dragEvent('dragenter', node)
    })
    expect(isOver(node)).toBe(true)
    await act(async () => {
      dragEvent('dragenter', child)
      dragEvent('dragleave', child)
    })
    expect(isOver(node)).toBe(true)
    await act(async () => {
      dragEvent('dragleave', node)
    })
    expect(isOver(node)).toBe(false)
  })

  it('resets the counter and hands the files over on drop', async () => {
    const onFiles = vi.fn()
    const node = await mountDropZone(onFiles)
    const child = node.querySelector('p') as HTMLElement
    await act(async () => {
      dragEvent('dragenter', node)
      dragEvent('dragenter', child)
    })
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: { files: [] } })
    await act(async () => {
      node.dispatchEvent(event)
    })
    expect(onFiles).toHaveBeenCalledWith([])
    expect(isOver(node)).toBe(false)
    await act(async () => {
      dragEvent('dragleave', node)
    })
    expect(isOver(node)).toBe(false)
  })
})

describe('UploadPicker folder support', () => {
  it('offers a folder chooser next to the file chooser', async () => {
    useMusic.setState({ uploadFiles: vi.fn(async () => {}) })
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(createElement(UploadPicker, { target: 'r2' }))
    })

    const folderInput = container.querySelector('input[webkitdirectory]')
    expect(folderInput).not.toBeNull()
    expect([...container.querySelectorAll('button')].some((button) => button.textContent?.includes(t('music.upload_choose_folder')))).toBe(true)
  })
})

async function mountDialog(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicTransferDialog, { open: true, onClose: () => {} }))
  })
}

function buttonNamed(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === label)
}

describe('download row actions (FB-F11)', () => {
  it('offers a retry on a failed row, and a cancel on a running one', async () => {
    useMusic.setState({
      downloads: [
        { id: 'd1', trackId: 't1', name: 'a.flac', percent: 0, status: 'failed', controller: new AbortController() },
        { id: 'd2', trackId: 't2', name: 'b.flac', percent: 40, status: 'downloading', controller: new AbortController() },
      ],
    })
    const retry = vi.fn(async () => {})
    const dismiss = vi.fn()
    useMusic.setState({ retryDownload: retry, dismissDownload: dismiss })
    await mountDialog()
    await act(async () => buttonNamed(t('music.download_retry'))?.click())
    expect(retry).toHaveBeenCalledWith('d1')
    const cancel = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === t('music.download_cancel'))
    await act(async () => cancel?.click())
    expect(dismiss).toHaveBeenCalledWith('d2')
    useMusic.setState({ downloads: [] })
  })
})

describe('download batch actions (FB-F11)', () => {
  it('stops a whole queue and retries its failures from the section label', async () => {
    const cancelAll = vi.fn()
    const retryFailed = vi.fn(async () => {})
    useMusic.setState({
      cancelDownloads: cancelAll,
      retryFailedDownloads: retryFailed,
      downloads: [
        { id: 'd1', trackId: 't1', name: 'a.flac', percent: 0, status: 'failed', controller: new AbortController() },
        { id: 'd2', trackId: 't2', name: 'b.flac', percent: 10, status: 'downloading', controller: new AbortController() },
        { id: 'd3', trackId: 't3', name: 'c.flac', percent: 20, status: 'downloading', controller: new AbortController() },
      ],
    })
    await mountDialog()
    await act(async () => buttonNamed(t('music.download_cancel_all'))?.click())
    await act(async () => buttonNamed(t('music.download_retry_failed'))?.click())
    expect(cancelAll).toHaveBeenCalledTimes(1)
    expect(retryFailed).toHaveBeenCalledTimes(1)
    useMusic.setState({ downloads: [] })
  })
})

describe('transfer task list scroll (UI-17)', () => {
  it('lets the keyboard scroll the uploads list under its section name', async () => {
    useMusic.setState({
      uploads: [{ id: 'u1', name: 'a.mp3', percent: 30, status: 'uploading', error: null, target: 'r2', controller: new AbortController() }],
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(createElement(MusicTransferDialog, { open: true, onClose: () => {} }))
    })
    const section = [...document.querySelectorAll('section')].find((node) => (
      node.querySelector('h3')?.textContent === t('music.transfers_uploads')
    ))
    expect(section).toBeDefined()
    const list = section?.querySelector('ul') as HTMLElement | null
    expect(list).not.toBeNull()
    expect(list?.getAttribute('tabindex')).toBe('0')
    expect(list?.getAttribute('aria-label')).toBe(t('music.transfers_uploads'))
    useMusic.setState({ uploads: [] })
  })
})
