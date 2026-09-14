/**
 * Which palette a fence asks for, and how the answer reaches the map that is already
 * on screen. Split from registry.test.ts, which is about adoption and write-back: this
 * file is about the two inputs (the app's setting and the fence's own statement) and
 * the fact that changing either repaints the live instance instead of rebuilding it.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../i18n'
import { destroyMindmaps } from './registry'
import { noteSource, scopeHarness } from './registry.test-helpers'
import { APP_THEME_CHOICE } from './theme'

beforeAll(async () => {
  await initI18n()
})

afterEach(() => {
  destroyMindmaps('scope-a')
  vi.useRealTimers()
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
      expect(map.paints).toEqual([{ dark: true, choice: APP_THEME_CHOICE }])
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
      expect(h.records[0]!.paints).toEqual([])
    }
    finally {
      h.dispose()
    }
  })
})

// The fence body's own choice outranks the setting the describe above drives.
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

// The outline format has nowhere to put a `theme` field, so the fence's info string
// carries the same statement and the registry resolves the two the same way.
describe('mindmap registry — the palette named beside the fence', () => {
  it('draws with the palette the info string names', async () => {
    const h = scopeHarness(noteSource('- Root', 'theme=dark'))
    try {
      await h.mount(noteSource('- Root', 'theme=dark'))
      expect(h.records[0]!.options.body.theme).toEqual({ kind: 'dark' })
    }
    finally {
      h.dispose()
    }
  })

  it('lets the body\'s own field outrank the annotation beside it', async () => {
    const h = scopeHarness(noteSource('- Root', 'theme=dark'), { theme: { kind: 'light' } })
    try {
      await h.mount(noteSource('- Root', 'theme=dark'))
      expect(h.records[0]!.options.body.theme).toEqual({ kind: 'light' })
    }
    finally {
      h.dispose()
    }
  })

  it('repaints the live map when only the annotation changed', async () => {
    const h = scopeHarness(noteSource('- Root', 'theme=dark'))
    try {
      await h.mount(noteSource('- Root', 'theme=dark'))
      const map = h.records[0]!
      // The same body, one annotation later: the map is the same map, and a
      // refresh here would drop the camera and the selection for a colour change.
      await h.mount(noteSource('- Root', 'theme=light'))
      expect(h.records).toHaveLength(1)
      expect(h.records[0]!.el).toBe(map.el)
      expect(map.paints).toEqual([{ dark: false, choice: { kind: 'light' } }])
      expect(map.refreshes).toHaveLength(0)
    }
    finally {
      h.dispose()
    }
  })
})

describe('mindmap registry — an annotation nobody can read', () => {
  it('shows the source and says why', async () => {
    const h = scopeHarness(noteSource('- Root', 'theme=sepia'))
    try {
      await h.mount(noteSource('- Root', 'theme=sepia'))
      expect(h.records).toHaveLength(0)
      const block = h.host.querySelector<HTMLElement>('.mindmap-block')!
      expect(block.classList.contains('has-error')).toBe(true)
      expect(block.textContent).toContain('"theme"')
      expect(block.textContent).toContain('- Root')
    }
    finally {
      h.dispose()
    }
  })
})
