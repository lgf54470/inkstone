import { createElement, act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { renderElement } from '../../lib/test-render'
import { api } from '../../lib/api'
import { LocalGraphPanel } from './local-graph'

vi.mock('../../lib/api', () => ({
  api: {
    graph: vi.fn(),
  },
}))

const sampleGraph: GraphResponse = {
  nodes: [
    { id: 'note-1', title: 'Note 1', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderName: null, folderColor: null, tags: [] },
    { id: 'note-2', title: 'Note 2', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderName: null, folderColor: null, tags: [] },
  ],
  edges: [{ source: 'note-1', target: 'note-2' }],
  meta: { mode: 'local', centerId: 'note-1', depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 100 },
}

describe('LocalGraphPanel data lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders header and loads local graph data', async () => {
    vi.mocked(api.graph).mockResolvedValueOnce(sampleGraph)
    const { container, unmount } = renderElement(createElement(LocalGraphPanel, { noteId: 'note-1' }))

    expect(container.querySelector('section')).toBeTruthy()
    expect(api.graph).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'local', center: 'note-1' }),
      expect.any(AbortSignal),
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('2')
    unmount()
  })

  it('handles error state and provides retry', async () => {
    vi.mocked(api.graph).mockRejectedValueOnce(new Error('Network failure'))
    const { container, unmount } = renderElement(createElement(LocalGraphPanel, { noteId: 'note-1' }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Network failure')

    vi.mocked(api.graph).mockResolvedValueOnce(sampleGraph)
    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.toLowerCase().includes('retry'))
    if (retryBtn) {
      await act(async () => {
        retryBtn.click()
        await new Promise((r) => setTimeout(r, 20))
      })
    }

    expect(container.textContent).toContain('2')
    unmount()
  })
})

describe('LocalGraphPanel action callbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fires callbacks on header action buttons', async () => {
    vi.mocked(api.graph).mockResolvedValueOnce(sampleGraph)
    const onOpenFullGraph = vi.fn()
    const onClose = vi.fn()
    const { container, unmount } = renderElement(createElement(LocalGraphPanel, {
      noteId: 'note-1',
      onOpenFullGraph,
      onClose,
    }))

    await act(async () => {
      await Promise.resolve()
    })

    const buttons = container.querySelectorAll('button')
    for (const btn of buttons) {
      act(() => {
        btn.click()
      })
    }

    expect(onOpenFullGraph).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    unmount()
  })
})
