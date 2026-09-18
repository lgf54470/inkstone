import { act, createElement, useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../../test-render'
import { useKanbanHistory } from './kanban-history'
import type { KanbanData } from '../types'

function makeData(title: string): KanbanData {
  return { title, views: [{ id: 'v', name: 'Board', type: 'board', groupBy: 'status' }], columns: [], items: [] }
}

type HistoryApi = ReturnType<typeof useKanbanHistory>

interface Holder {
  a: HistoryApi | null
  b: HistoryApi | null
}

function Probe({ holder }: { holder: Holder }) {
  const refA = useRef<HTMLDivElement>(null)
  const apiA = useKanbanHistory(makeData('a1'), vi.fn(), refA)
  const refB = useRef<HTMLDivElement>(null)
  const apiB = useKanbanHistory(makeData('b1'), vi.fn(), refB)
  holder.a = apiA
  holder.b = apiB
  return createElement(
    'div',
    null,
    createElement('div', { ref: refA }, createElement('span', { id: 'inside-a' })),
    createElement('div', { ref: refB }, createElement('span', { id: 'inside-b' })),
  )
}

function pressCtrlZ(target: Element) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }))
  })
}

describe('useKanbanHistory keyboard scope', () => {
  it('undoes when the keydown bubbles through this instance container', () => {
    const holder: Holder = { a: null, b: null }
    const rendered = renderElement(createElement(Probe, { holder }))
    try {
      const initial = holder.a!.data
      act(() => {
        holder.a!.commitData(makeData('a2'))
      })
      expect(holder.a!.data.title).toBe('a2')
      pressCtrlZ(document.getElementById('inside-a')!)
      expect(holder.a!.data).toBe(initial)
    } finally {
      rendered.unmount()
    }
  })

  it('leaves global undo semantics alone when the keydown happens outside every board', () => {
    const holder: Holder = { a: null, b: null }
    const rendered = renderElement(createElement(Probe, { holder }))
    try {
      act(() => {
        holder.a!.commitData(makeData('a2'))
      })
      const afterCommit = holder.a!.data
      pressCtrlZ(document.body)
      expect(holder.a!.data).toBe(afterCommit)
    } finally {
      rendered.unmount()
    }
  })
})

describe('useKanbanHistory keyboard scope across boards', () => {
  it('two boards on screen: ctrl+z inside board A only reverts board A', () => {
    const holder: Holder = { a: null, b: null }
    const rendered = renderElement(createElement(Probe, { holder }))
    try {
      act(() => {
        holder.a!.commitData(makeData('a2'))
      })
      act(() => {
        holder.b!.commitData(makeData('b2'))
      })
      const bAfterCommit = holder.b!.data
      pressCtrlZ(document.getElementById('inside-a')!)
      expect(holder.a!.data.title).toBe('a1')
      expect(holder.b!.data).toBe(bAfterCommit)
    } finally {
      rendered.unmount()
    }
  })
})

function StabilityProbe({ holder, onUpdate }: { holder: { api: HistoryApi | null }; onUpdate: (next: KanbanData) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  holder.api = useKanbanHistory(makeData('s1'), onUpdate, ref)
  return createElement('div', { ref })
}

function renderStabilityProbe(onUpdate = vi.fn()) {
  const holder = { api: null as HistoryApi | null }
  const rendered = renderElement(createElement(StabilityProbe, { holder, onUpdate }))
  return { holder, rendered, onUpdate }
}

describe('useKanbanHistory commitData stability', () => {
  it('keeps the same commitData identity across commits so memoized children stay stable', () => {
    const { holder, rendered } = renderStabilityProbe()
    try {
      const commit = holder.api!.commitData
      act(() => {
        commit(makeData('s2'))
      })
      expect(holder.api!.commitData).toBe(commit)
    } finally {
      rendered.unmount()
    }
  })

  it('resolves functional updaters against the newest data even from a captured commitData', () => {
    const { holder, rendered } = renderStabilityProbe()
    try {
      const commit = holder.api!.commitData
      act(() => {
        commit((prev) => makeData(`${prev.title}+`))
      })
      act(() => {
        commit((prev) => makeData(`${prev.title}+`))
      })
      expect(holder.api!.data.title).toBe('s1++')
    } finally {
      rendered.unmount()
    }
  })

  it('forwards each resolved commit to onUpdateData', () => {
    const { holder, rendered, onUpdate } = renderStabilityProbe()
    try {
      act(() => {
        holder.api!.commitData((prev) => makeData(`${prev.title}+`))
      })
      expect(onUpdate).toHaveBeenCalledTimes(1)
      expect((onUpdate.mock.calls[0]![0] as KanbanData).title).toBe('s1+')
    } finally {
      rendered.unmount()
    }
  })
})
