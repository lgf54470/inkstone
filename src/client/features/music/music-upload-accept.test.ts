import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { UploadPicker } from './music-transfer-dialog'
import { MusicWebdavModal } from './music-webdav-modal'
import { useMusic } from './music-store'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  if (typeof (globalThis as Record<string, unknown>).ResizeObserver === 'undefined') {
    ;(globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

let root: Root | null = null

async function mount(element: React.ReactElement): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(element)
  })
  return container
}

function acceptingInputs(scope: ParentNode): string[] {
  return [...scope.querySelectorAll<HTMLInputElement>('input[type="file"][accept]')].map((input) => input.getAttribute('accept') ?? '')
}

beforeEach(() => {
  useMusic.setState({
    uploadFiles: vi.fn(async () => {}),
    webdav: {
      loading: false,
      configured: true,
      dir: '/srv/music',
      directory: '',
      path: 'jazz',
      entries: [],
      truncated: false,
      error: null,
      importingPaths: [],
    },
    browseWebdav: vi.fn(async () => {}),
  })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

// The folder picker deliberately carries no accept - the pre-check filters noise there -
// so every picker that does advertise containers must promise the same kinds.
describe('upload pickers advertise video containers (M-55a)', () => {
  it('lets the file chooser in the upload dialog pick a clip, not only audio', async () => {
    const container = await mount(createElement(UploadPicker, { target: 'r2' }))
    const accepts = acceptingInputs(container)
    expect(accepts.length).toBeGreaterThan(0)
    for (const accept of accepts) {
      expect(accept).toContain('audio/')
      expect(accept).toContain('video/')
    }
  })

  it('lets the file chooser in the WebDAV dialog pick a clip, not only audio', async () => {
    await mount(createElement(MusicWebdavModal, { open: true, onClose: () => {} }))
    const accepts = acceptingInputs(document.body)
    expect(accepts.length).toBeGreaterThan(0)
    for (const accept of accepts) {
      expect(accept).toContain('audio/')
      expect(accept).toContain('video/')
    }
  })
})
