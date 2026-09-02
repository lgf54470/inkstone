import { EditorState } from '@codemirror/state'
import { CompletionContext } from '@codemirror/autocomplete'
import { describe, expect, it } from 'vitest'
import { tagSource } from './completion'

describe('tagSource', () => {
  it('returns tag completion options and prioritizes pinned tags', () => {
    const state = EditorState.create({ doc: 'Hello #wo' })
    const context = new CompletionContext(state, 9, true)
    const source = tagSource(() => ({
      notes: () => [],
      tags: () => [
        { name: 'work/backend', count: 2, isPinned: false },
        { name: 'work/frontend', count: 1, isPinned: true },
      ],
    }))

    const result = source(context)
    expect(result).not.toBeNull()
    expect(result?.options).toHaveLength(2)
    const pinned = result!.options.find((o) => o.label === 'work/frontend')
    const unpinned = result!.options.find((o) => o.label === 'work/backend')
    expect(pinned?.detail).toContain('📌')
    expect((pinned?.boost ?? 0) > (unpinned?.boost ?? 0)).toBe(true)
  })
})
