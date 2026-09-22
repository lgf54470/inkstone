import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../../lib/i18n'
import { installTestGlobals } from '../../../test-render'
import { useSession } from '../../../../store/session'
import { KanbanFilePreviewModal } from './kanban-file-preview-modal'
import type { KanbanFile } from '../types'

beforeAll(async () => {
  await initI18n()
})

afterEach(() => {
  setExternalImages(false)
  vi.unstubAllGlobals()
})

function setExternalImages(allowed: boolean): void {
  useSession.setState((state) => ({
    settings: { ...state.settings, preview: { ...state.settings.preview, externalImages: allowed } },
  }))
}

const pdfFile: KanbanFile = {
  id: 'file-1',
  name: 'spec.pdf',
  size: 2048,
  mime: 'application/pdf',
  url: '/api/kanban/file/default/1-spec.pdf',
}

const remoteImage: KanbanFile = {
  id: 'file-2',
  name: 'shot.png',
  size: 4096,
  mime: 'image/png',
  url: 'https://tracker.example.test/pixel.png',
}

const localImage: KanbanFile = { ...remoteImage, id: 'file-3', url: '/api/kanban/file/default/3-shot.png' }

const textFile: KanbanFile = {
  id: 'file-4',
  name: 'notes.txt',
  size: 512,
  mime: 'text/plain',
  url: '/api/kanban/file/default/4-notes.txt',
}

function stubTextRead(respond: () => Promise<{ ok: boolean; status?: number; text: () => Promise<string> }>) {
  const fetchMock = vi.fn(respond)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** The read is a promise chain, so the assertions run after the microtask queue has drained. */
async function flushRead(): Promise<void> {
  await act(async () => { await Promise.resolve() })
}

function renderPreview(file: KanbanFile | null) {
  installTestGlobals()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(KanbanFilePreviewModal, { file, onClose: vi.fn() }))
  })
  return {
    dispose: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('KanbanFilePreviewModal for an image', () => {
  it('draws a placeholder in place of another origin while external images are off, and says why', () => {
    const rendered = renderPreview(remoteImage)
    try {
      expect(document.querySelector('img'), 'a blocked preview was still requested').toBeNull()
      expect(document.body.textContent).toContain(t('markdown.external_image_blocked'))
    } finally {
      rendered.dispose()
    }
  })

  it('shows that image without a referrer once the account allows external images', () => {
    setExternalImages(true)
    const rendered = renderPreview(remoteImage)
    try {
      const image = document.querySelector('img')
      expect(image, 'the account allowed external images but the preview stayed blocked').not.toBeNull()
      expect(image!.getAttribute('referrerpolicy')).toBe('no-referrer')
    } finally {
      rendered.dispose()
    }
  })

  it('shows a same-origin image whatever the account allows', () => {
    const rendered = renderPreview(localImage)
    try {
      expect(document.querySelector('img')).not.toBeNull()
      expect(document.body.textContent).not.toContain(t('markdown.external_image_blocked'))
    } finally {
      rendered.dispose()
    }
  })

  it('never blocks a document it cannot draw as an image anyway', () => {
    const rendered = renderPreview(pdfFile)
    try {
      expect(document.body.textContent).toContain('spec.pdf')
    } finally {
      rendered.dispose()
    }
  })
})

describe('KanbanFilePreviewModal when an image cannot be drawn', () => {
  it('says so when an allowed image fails to load, rather than leaving a broken frame', () => {
    setExternalImages(true)
    const rendered = renderPreview(remoteImage)
    try {
      const image = document.querySelector('img')
      expect(image).not.toBeNull()
      act(() => {
        image!.dispatchEvent(new Event('error'))
      })
      expect(document.querySelector('img'), 'the broken image stayed on screen').toBeNull()
      expect(document.body.textContent).toContain(t('preview.kanban_file_load_failed'))
    } finally {
      rendered.dispose()
    }
  })
})

describe('KanbanFilePreviewModal for text', () => {
  it('shows the text when the read succeeds', async () => {
    stubTextRead(async () => ({ ok: true, text: async () => 'hello board' }))
    const rendered = renderPreview(textFile)
    try {
      await flushRead()
      expect(document.querySelector('pre')?.textContent).toBe('hello board')
    } finally {
      rendered.dispose()
    }
  })

  it('treats a stored file that is gone as a failed read, not as its body', async () => {
    stubTextRead(async () => ({ ok: false, status: 404, text: async () => 'File not found' }))
    const rendered = renderPreview(textFile)
    try {
      await flushRead()
      expect(document.body.textContent).toContain(t('preview.kanban_file_load_failed'))
      expect(document.body.textContent, 'the 404 body was shown as the file\'s content').not.toContain('File not found')
    } finally {
      rendered.dispose()
    }
  })
})

describe('KanbanFilePreviewModal when a text read does not produce the document', () => {
  it('says the read failed instead of showing an empty document', async () => {
    stubTextRead(async () => { throw new Error('offline') })
    const rendered = renderPreview(textFile)
    try {
      await flushRead()
      expect(document.body.textContent).toContain(t('preview.kanban_file_load_failed'))
      expect(document.querySelector('pre'), 'a failed read still drew a document body').toBeNull()
    } finally {
      rendered.dispose()
    }
  })

  it('reads again when the reader asks it to', async () => {
    let attempt = 0
    const fetchMock = stubTextRead(async () => {
      attempt += 1
      if (attempt === 1) throw new Error('offline')
      return { ok: true, text: async () => 'second try' }
    })
    const rendered = renderPreview(textFile)
    try {
      await flushRead()
      const retry = [...document.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === t('preview.kanban_file_retry'),
      )
      expect(retry, 'a failed read offered no way to read it again').toBeDefined()
      await act(async () => { retry!.click(); await Promise.resolve() })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(document.querySelector('pre')?.textContent).toBe('second try')
    } finally {
      rendered.dispose()
    }
  })

  it('calls a file with nothing in it empty, not broken', async () => {
    stubTextRead(async () => ({ ok: true, text: async () => '' }))
    const rendered = renderPreview(textFile)
    try {
      await flushRead()
      expect(document.body.textContent).toContain(t('preview.kanban_file_empty'))
      expect(document.body.textContent).not.toContain(t('preview.kanban_file_load_failed'))
    } finally {
      rendered.dispose()
    }
  })
})

describe('KanbanFilePreviewModal for PDF', () => {
  it('never embeds the document via <object>/<embed> (CSP object-src/frame-src none)', () => {
    const rendered = renderPreview(pdfFile)
    try {
      expect(document.querySelector('object')).toBeNull()
      expect(document.querySelector('embed')).toBeNull()
      expect(document.body.textContent).toContain('spec.pdf')
    } finally {
      rendered.dispose()
    }
  })

  it('offers a new-tab link pointing at the file url', () => {
    const rendered = renderPreview(pdfFile)
    try {
      const links = Array.from(document.querySelectorAll('a')).filter(
        (a) => a.getAttribute('href') === pdfFile.url,
      )
      expect(links.length).toBeGreaterThan(0)
      expect(links.some((a) => a.target === '_blank')).toBe(true)
    } finally {
      rendered.dispose()
    }
  })
})
