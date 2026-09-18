import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../../../lib/i18n'
import { installTestGlobals } from '../../../test-render'
import { KanbanFilePreviewModal } from './kanban-file-preview-modal'
import type { KanbanFile } from '../types'

beforeAll(async () => {
  await initI18n()
})

const pdfFile: KanbanFile = {
  id: 'file-1',
  name: 'spec.pdf',
  size: 2048,
  mime: 'application/pdf',
  url: '/api/kanban/file/default/1-spec.pdf',
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
