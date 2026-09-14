import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../i18n'
import { renderMarkdown } from '../renderer'
import { applyBodyAtFence } from './body'
import { captureMindmapFocus, destroyMindmaps, flushMindmaps, mountMindmaps } from './registry'
import { deferredVendorLoader, deliverResize, installResizeObserverStub, noteSource, scopeHarness, stubVendor, type StubMap } from './registry.test-helpers'
import type { MindmapFenceRef, MindmapWriteResult } from './types'

beforeAll(async () => {
  await initI18n()
})

afterEach(() => {
  destroyMindmaps('scope-a')
  vi.useRealTimers()
})

describe('mindmap registry — adoption across re-renders', () => {
  it('moves the live map into the new placeholder instead of rebuilding it', async () => {
    const h = scopeHarness(noteSource('- Root\n  - A'))
    try {
      await h.mount(noteSource('- Root\n  - A'))
      expect(h.records).toHaveLength(1)
      const map = h.records[0]!
      expect(map.el.parentElement?.dataset.mindmapPlaceholder).toBeDefined()

      // A keystroke elsewhere in the note: the preview replaces its HTML wholesale.
      await h.mount(noteSource('- Root\n  - A'))
      expect(h.records).toHaveLength(1)
      expect(h.records[0]!.el).toBe(map.el)
      expect(h.records[0]!.el.isConnected).toBe(true)
      expect(map.refreshes).toHaveLength(0)
    }
    finally {
      h.dispose()
    }
  })

  it('refreshes the same instance when the fence itself was edited', async () => {
    const h = scopeHarness(noteSource('- Root\n  - A'))
    try {
      await h.mount(noteSource('- Root\n  - A'))
      const map = h.records[0]!
      await h.mount(noteSource('- Root\n  - A\n  - B'))
      expect(h.records).toHaveLength(1)
      expect(map.el).toBe(h.records[0]!.el)
      expect(map.refreshes).toHaveLength(1)
      expect(map.current).toBe('- Root\n  - A\n  - B')
    }
    finally {
      h.dispose()
    }
  })
})

describe('mindmap registry — theme following', () => {
  it('hands a theme switch to the live map instead of rebuilding it', async () => {
    const h = scopeHarness(noteSource('- Root\n  - A'))
    try {
      await h.mount(noteSource('- Root\n  - A'))
      const map = h.records[0]!
      // The same markup, one commit later, under the other theme: the map draws
      // its own palette into its element, so the instance has to be told. A
      // rebuild here would be the bug — and so would a refresh, which drops the
      // camera, the selection and any open topic editor.
      await h.mount(noteSource('- Root\n  - A'), { dark: true })
      expect(h.records).toHaveLength(1)
      expect(h.records[0]!.el).toBe(map.el)
      expect(map.themes).toEqual([true])
      expect(map.refreshes).toHaveLength(0)
    }
    finally {
      h.dispose()
    }
  })

  it('leaves the live map alone when the theme did not change', async () => {
    const h = scopeHarness(noteSource('- Root\n  - A'))
    try {
      await h.mount(noteSource('- Root\n  - A'))
      await h.mount(noteSource('- Root\n  - A'))
      expect(h.records[0]!.themes).toEqual([])
    }
    finally {
      h.dispose()
    }
  })

})

// Separate from the app's own switch: these are about what the fence body itself asks
// for, which outranks the setting the other describe drives.
describe('mindmap registry — a body\'s own palette', () => {
  it('creates the map with the palette its own body asks for', async () => {
    // The body's choice travels with the body: the vendor resolves it against the
    // app's setting (see ./theme), and it has to reach the instance that draws.
    const h = scopeHarness(noteSource('- Root'), { theme: { kind: 'light' } })
    try {
      await h.mount(noteSource('- Root'), { dark: true })
      expect(h.records[0]!.options.body.theme).toEqual({ kind: 'light' })
      expect(h.records[0]!.options.dark).toBe(true)
    }
    finally {
      h.dispose()
    }
  })

  it('loads the palette a new body asks for into the live instance', async () => {
    const h = scopeHarness(noteSource('- Root'))
    try {
      await h.mount(noteSource('- Root'))
      const map = h.records[0]!
      // The fence now says `"theme": "dark"`, so the next parse reports it.
      h.setBodyTheme({ kind: 'dark' })
      await h.mount(noteSource('- Root\n  - A'))
      expect(h.records).toHaveLength(1)
      expect(map.refreshes.map((body) => body.theme)).toEqual([{ kind: 'dark' }])
    }
    finally {
      h.dispose()
    }
  })
})

describe('mindmap registry — overlapping mount passes', () => {
  it('keeps the map a newer pass installed when an overtaken pass finishes late', async () => {
    // The load is deliberately held open: a pass that spans awaits can be
    // overtaken by a newer one (a surface torn down and rebuilt, or the second
    // half of StrictMode's mount/cleanup/mount), and its `assignments` then
    // describe markup nobody renders anymore.
    const h = scopeHarness(noteSource('- Root\n  - A'))
    const { load, release } = deferredVendorLoader(h.records)
    try {
      const overtaken = h.mount(noteSource('- Root\n  - A'), { loadVendor: load })
      // The surface goes away while that pass is still waiting on the chunk.
      destroyMindmaps('scope-a')
      await h.mount(noteSource('- Root\n  - A'))
      const live = h.records.at(-1)!
      expect(live.el.isConnected).toBe(true)

      release()
      await overtaken

      expect(live.destroyed).toBe(false)
      expect(live.el.isConnected).toBe(true)
      expect(h.host.querySelectorAll('.mindmap-canvas')).toHaveLength(1)
      // The late pass does not build a second instance either: the block already
      // has one.
      expect(h.records).toHaveLength(1)
    }
    finally {
      h.dispose()
    }
  })

  it('builds one instance when two passes reach the same block', async () => {
    const h = scopeHarness(noteSource('- Root\n  - A'))
    const { load, release } = deferredVendorLoader(h.records)
    try {
      const first = h.mount(noteSource('- Root\n  - A'), { loadVendor: load })
      const second = h.mount(noteSource('- Root\n  - A'), { loadVendor: load })
      release()
      await Promise.all([first, second])
      // Two `create` calls would leave a library instance bound to an element
      // nothing renders, listening to the document forever.
      expect(h.records).toHaveLength(1)
      expect(h.host.querySelectorAll('.mindmap-canvas')).toHaveLength(1)
    }
    finally {
      h.dispose()
    }
  })
})

describe('mindmap registry — block identity', () => {
  it('keeps the map with its body when a block is inserted above it', async () => {
    const first = noteSource('- Root\n  - A')
    const twoBlocks = ['# Title', '', '```mindmap', '- Second', '```', '', '```mindmap', '- Root\n  - A', '```', '', 'tail'].join('\n')
    const h = scopeHarness(first)
    try {
      await h.mount(first)
      const map = h.records[0]!
      await h.mount(twoBlocks)
      // The inserted block is numbered 0 and gets a fresh instance; the map that
      // was there follows its body to block 1 with its element intact.
      expect(h.records).toHaveLength(2)
      const blockOne = h.host.querySelectorAll<HTMLElement>('[data-mindmap]')[1]!
      expect(blockOne.contains(map.el)).toBe(true)
      expect(map.refreshes).toHaveLength(0)
    }
    finally {
      h.dispose()
    }
  })
})

describe('mindmap registry — write-back', () => {
  it('debounces operations into one write and mirrors the body back into the note', async () => {
    let content = noteSource('- Root\n  - A')
    const writes: { ref: MindmapFenceRef; next: string }[] = []
    const h = scopeHarness(content, {
      writeBack: (ref, next) => {
        writes.push({ ref, next })
        const applied = applyBodyAtFence(content, ref, next)
        if (applied === null) return 'conflict'
        content = applied
        return 'written'
      },
    })
    try {
      vi.useFakeTimers()
      await h.mount(content)
      const map = h.records[0]!
      map.current = '- Root\n  - A\n  - B'
      map.options.onOperation()
      map.options.onOperation()
      expect(writes).toHaveLength(0)
      vi.advanceTimersByTime(500)
      expect(writes).toHaveLength(1)
      expect(writes[0]!.next).toBe('- Root\n  - A\n  - B')
      expect(content).toBe(noteSource('- Root\n  - A\n  - B'))
      // The note now holds exactly what the map holds: the next render adopts it.
      await h.mount(content)
      expect(h.records).toHaveLength(1)
      expect(map.refreshes).toHaveLength(0)
    }
    finally {
      h.dispose()
    }
  })

})

describe('mindmap registry — degraded writes', () => {
  it('leaves the note alone and reports a conflict when the fence no longer matches', async () => {
    const results: MindmapWriteResult[] = []
    const h = scopeHarness(noteSource('- Root\n  - A'), {
      writeBack: (ref, next) => {
        results.push('conflict')
        return applyBodyAtFence('unrelated content', ref, next) === null ? 'conflict' : 'written'
      },
    })
    try {
      vi.useFakeTimers()
      await h.mount(noteSource('- Root\n  - A'))
      const map = h.records[0]!
      map.current = '- Root\n  - A\n  - B'
      map.options.onOperation()
      vi.advanceTimersByTime(500)
      flushMindmaps('scope-a')
      expect(results).toEqual(['conflict'])
    }
    finally {
      h.dispose()
    }
  })

  it('writes the pending change when the surface goes away', async () => {
    const writes: string[] = []
    const h = scopeHarness(noteSource('- Root'), { writeBack: (_ref, next) => (writes.push(next), 'written') })
    try {
      await h.mount(noteSource('- Root'))
      const map = h.records[0]!
      map.current = '- Root\n- Second'
      map.options.onOperation()
      destroyMindmaps('scope-a')
      expect(writes).toEqual(['- Root\n- Second'])
      expect(map.destroyed).toBe(true)
    }
    finally {
      h.dispose()
    }
  })
})

describe('mindmap registry — read-only blocks', () => {
  it('snapshots a map inside an embedded note instead of mounting an editable one', async () => {
    const records: StubMap[] = []
    const host = document.createElement('div')
    document.body.append(host)
    host.innerHTML = renderMarkdown(noteSource('- Root')).html
    const block = host.querySelector<HTMLElement>('[data-mindmap]')!
    // An embedded note's body: same markup, another note's line numbers.
    const embed = document.createElement('div')
    embed.className = 'note-embed-body'
    embed.append(block)
    host.append(embed)
    try {
      await mountMindmaps(host, {
        scope: 'scope-a',
        noteId: 'note-1',
        dark: false,
        locale: 'en-US',
        editable: true,
        writeBack: () => 'written',
        loadVendor: async () => stubVendor(records),
      })
      expect(records.every((record) => record.options.editable === false)).toBe(true)
      await vi.waitFor(() => {
        expect(host.querySelector('img.mindmap-image')).not.toBeNull()
      })
      expect(records.every((record) => record.destroyed)).toBe(true)
    }
    finally {
      host.remove()
    }
  })
})

describe('mindmap registry — pointer focus', () => {
  it('focuses the map when a pointer lands inside its canvas', async () => {
    const h = scopeHarness(noteSource('- Root\n  - A'))
    try {
      await h.mount(noteSource('- Root\n  - A'))
      const map = h.records[0]!
      const canvas = h.host.querySelector<HTMLElement>('[data-mindmap-canvas]')!
      const release = captureMindmapFocus(h.host)
      try {
        canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
        expect(map.focusCalls).toBe(1)
      }
      finally {
        release()
      }
    }
    finally {
      h.dispose()
    }
  })

  it('leaves the focus alone when the pointer targets the inline topic editor', async () => {
    const h = scopeHarness(noteSource('- Root\n  - A'))
    try {
      await h.mount(noteSource('- Root\n  - A'))
      const map = h.records[0]!
      const canvas = h.host.querySelector<HTMLElement>('[data-mindmap-canvas]')!
      const editor = document.createElement('div')
      editor.setAttribute('contenteditable', 'true')
      canvas.append(editor)
      const release = captureMindmapFocus(h.host)
      try {
        editor.focus()
        editor.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
        expect(map.focusCalls).toBe(0)
        expect(document.activeElement).toBe(editor)
      }
      finally {
        release()
        editor.remove()
      }
    }
    finally {
      h.dispose()
    }
  })
})

describe('mindmap registry — the library’s own toolbar', () => {
  it('takes the library’s native full screen request out of the toolbar', async () => {
    const h = scopeHarness(noteSource('- Root\n  - A'))
    try {
      await h.mount(noteSource('- Root\n  - A'))
      const button = h.records[0]!.toolbarFullscreen!
      // Re-parenting the canvas on the next render drops the browser's full
      // screen, so the button must not reach for it in the first place: the full
      // screen overlay (which the preview click handler routes it to) is the one
      // that survives a write.
      expect(button.onclick).toBeNull()
      button.click()
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(h.records[0]!.nativeFullscreenCalls).toBe(0)
    }
    finally {
      h.dispose()
    }
  })

  it('leaves the library’s other toolbar controls working', async () => {
    const h = scopeHarness(noteSource('- Root\n  - A'))
    try {
      await h.mount(noteSource('- Root\n  - A'))
      const map = h.records[0]!
      map.el.querySelector<HTMLElement>('#toCenter')!.click()
      expect(map.toolbarCenterCalls).toBe(1)
    }
    finally {
      h.dispose()
    }
  })
})

describe('mindmap registry — container resize', () => {
  it('re-fits the map when its container changes size', async () => {
    const deliveries = installResizeObserverStub()
    const h = scopeHarness(noteSource('- Root\n  - A'))
    try {
      await h.mount(noteSource('- Root\n  - A'))
      const map = h.records[0]!
      const canvas = h.host.querySelector<HTMLElement>('[data-mindmap-canvas]')!

      // The pane shrank/grew after the map mounted (split cycle, dragged divider).
      deliverResize(deliveries[0]!, canvas, 300, 320)
      expect(map.layoutCalls).toBe(1)
      expect(map.fitCalls).toBe(1)
    }
    finally {
      h.dispose()
      vi.unstubAllGlobals()
    }
  })

  it('skips the re-fit while the pane is hidden', async () => {
    const deliveries = installResizeObserverStub()
    const h = scopeHarness(noteSource('- Root\n  - A'))
    try {
      await h.mount(noteSource('- Root\n  - A'))
      const map = h.records[0]!
      const canvas = h.host.querySelector<HTMLElement>('[data-mindmap-canvas]')!

      // A zero box means the pane is hidden (edit-only layout): fitting into it
      // would wreck the camera, so nothing happens until a real box returns.
      deliverResize(deliveries[0]!, canvas, 0, 0)
      expect(map.layoutCalls).toBe(0)
      expect(map.fitCalls).toBe(0)
    }
    finally {
      h.dispose()
      vi.unstubAllGlobals()
    }
  })
})

describe('mindmap registry — keyboard operations', () => {
  it('carries a node added on the map into the note and keeps the instance', async () => {
    let content = noteSource('- Root\n  - A')
    const writes: string[] = []
    const h = scopeHarness(content, {
      writeBack: (ref, next) => {
        const applied = applyBodyAtFence(content, ref, next)
        if (applied === null) return 'conflict'
        writes.push(next)
        content = applied
        return 'written'
      },
    })
    try {
      vi.useFakeTimers()
      await h.mount(content)
      const map = h.records[0]!
      // Tab on the focused map is the library's own shortcut, so the block only
      // sees the operation it fires, with the new node already in its data.
      map.current = '- Root\n  - A\n  - New node'
      map.options.onOperation()
      expect(writes).toEqual([])
      vi.advanceTimersByTime(500)
      expect(writes).toEqual(['- Root\n  - A\n  - New node'])
      expect(content).toBe(noteSource('- Root\n  - A\n  - New node'))
      // The render that follows the write adopts the same instance.
      await h.mount(content)
      expect(h.records).toHaveLength(1)
      expect(map.el).toBe(h.records[0]!.el)
      expect(map.destroyed).toBe(false)
    }
    finally {
      h.dispose()
    }
  })
})

describe('mindmap registry — external fence edits', () => {
  it('refreshes the live map and drops its history instead of writing back', async () => {
    const writes: string[] = []
    const h = scopeHarness(noteSource('- Root\n  - A'), { writeBack: (_ref, next) => (writes.push(next), 'written') })
    try {
      await h.mount(noteSource('- Root\n  - A'))
      const map = h.records[0]!
      await h.mount(noteSource('- Root\n  - A\n  - Typed by hand'))
      expect(map.refreshes.map((body) => body.data)).toEqual([{ body: '- Root\n  - A\n  - Typed by hand' }])
      expect(map.current).toBe('- Root\n  - A\n  - Typed by hand')
      // The map was rebuilt around the new body, so undoing into the old one has
      // to be impossible; the note's own edit is never overwritten either.
      expect(map.historyCleared).toBe(true)
      expect(writes).toEqual([])
    }
    finally {
      h.dispose()
    }
  })
})
