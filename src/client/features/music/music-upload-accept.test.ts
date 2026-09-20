import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { UploadPicker } from './music-transfer-dialog'
import { MusicWebdavModal } from './music-webdav-modal'
import { useMusic } from './music-store'
import { partitionUploadableFiles } from './music-utils'

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
// while every picker that does advertise containers must promise exactly the kinds the
// upload path accepts. A wider list (audio/*, video/*) let the chooser offer files the
// pre-check then skipped, which reads as an upload that failed without ever starting, and
// the picker is the only place where the type filter can run before the user commits.
function expectAdvertisesUploadable(scope: ParentNode): void {
  const accepts = acceptingInputs(scope)
  expect(accepts.length).toBeGreaterThan(0)
  for (const accept of accepts) {
    const entries = accept.split(',').map((entry) => entry.trim())
    // Extensions, not MIME families: every entry must name a container the gate accepts.
    expect(entries.filter((entry) => !entry.startsWith('.'))).toEqual([])
    for (const entry of entries) {
      const file = new File([new Uint8Array([1])], `sample${entry}`)
      expect(partitionUploadableFiles([file]).accepted).toHaveLength(1)
    }
    // Video containers stay pickable, which is what M-55a added them for.
    expect(entries).toEqual(expect.arrayContaining(['.mp4', '.mov', '.webm']))
  }
}

describe('upload pickers advertise what the upload accepts', () => {
  it('narrows the file chooser in the upload dialog to those containers', async () => {
    expectAdvertisesUploadable(await mount(createElement(UploadPicker, { target: 'r2' })))
  })

  it('narrows the file chooser in the WebDAV dialog to the same ones', async () => {
    await mount(createElement(MusicWebdavModal, { open: true, onClose: () => {} }))
    expectAdvertisesUploadable(document.body)
  })
})
