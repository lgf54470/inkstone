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
