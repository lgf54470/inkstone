/**
 * Which palette a fence asks for, and how the answer reaches the map that is already
 * on screen. Split from registry.test.ts, which is about adoption and write-back: this
 * file is about the two inputs (the app's setting and the fence's own statement) and
 * the fact that changing either repaints the live instance instead of rebuilding it.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../i18n'
import { applyFencePatchAtSource, type MindmapFencePatch } from './body'
import { t } from '../../i18n'
import { destroyMindmaps, mindmapThemeMenuState, pickMindmapTheme } from './registry'
import { noteSource, scopeHarness } from './registry.test-helpers'
import { APP_THEME_CHOICE, type MindmapThemeChoice } from './theme'
import type { MindmapFenceWriter } from './types'
import { mindmapThemeMenuPicks } from './view'

/** The palette control this block's header carries, and the block it belongs to. */
function buttonOf(harness: ReturnType<typeof scopeHarness>): HTMLButtonElement {
  return harness.host.querySelector<HTMLButtonElement>('[data-mindmap-theme-pick]')!
}

function blockOf(harness: ReturnType<typeof scopeHarness>): HTMLElement {
  return harness.host.querySelector<HTMLElement>('[data-mindmap]')!
}

/** What the block's palette menu would open on. */
function blockThemeOf(harness: ReturnType<typeof scopeHarness>): MindmapThemeChoice {
  return mindmapThemeMenuState(blockOf(harness))!.choice
}

/**
 * A fence writer over a note held in this test: the pick's patch is recorded and applied
 * to the text, which is what the store does in the app.
 */
function fenceWriter(initial: string): { patches: MindmapFencePatch[]; content: () => string; writeFence: MindmapFenceWriter } {
  const patches: MindmapFencePatch[] = []
  let content = initial
  return {
    patches,
    content: () => content,
    writeFence: (ref, patch) => {
      patches.push(patch)
      const applied = applyFencePatchAtSource(content, ref, patch)
      if (applied === null) return 'conflict'
      content = applied
      return 'written'
    },
  }
}

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

// The header's control writes the fence, so what it offers has to be what the map draws
// with — and a pick has to reach the note through the same fence surgery as an edit.
describe('mindmap registry — the palette control in the block header', () => {
  it('shows the palette the map draws with', async () => {
    const h = scopeHarness(noteSource('- Root', 'theme=dark'))
    try {
      await h.mount(noteSource('- Root', 'theme=dark'))
      expect(buttonOf(h).textContent).toBe(t('preview.mindmap_theme_dark'))
      expect(buttonOf(h).getAttribute('aria-label')).toContain(t('preview.mindmap_theme_dark'))
      // The markup goes through the prose sanitizer, whose whitelist has to keep the
      // attributes the menu is announced by.
      expect(buttonOf(h).getAttribute('aria-haspopup')).toBe('menu')
      expect(buttonOf(h).getAttribute('aria-expanded')).toBe('false')
    }
    finally {
      h.dispose()
    }
  })

  it('names the palette again on a fresh render of the same fence', async () => {
    const h = scopeHarness(noteSource('- Root', 'theme=dark'))
    try {
      await h.mount(noteSource('- Root', 'theme=dark'))
      expect(buttonOf(h).textContent).toBe(t('preview.mindmap_theme_dark'))
      // The block's markup is rebuilt on every commit and ships the renderer's default text,
      // so a re-render that changes no palette still has to put the answer back on the control.
      await h.mount(noteSource('- Root', 'theme=dark'))
      expect(buttonOf(h).textContent).toBe(t('preview.mindmap_theme_dark'))
      // Nothing about the palette moved, so the map is neither rebuilt nor repainted; the
      // control is the only thing the fresh markup needs told again.
      expect(h.records).toHaveLength(1)
      expect(h.records[0]!.paints).toEqual([])
    }
    finally {
      h.dispose()
    }
  })

})

// What the menu offers, and what a body that states a palette of its own is called there.
describe('mindmap registry — what the palette menu offers', () => {
  it('offers the custom entry only for a body that carries a theme object', async () => {
    expect(mindmapThemeMenuPicks({ kind: 'light' })).toEqual(['auto', 'light', 'dark'])
    expect(mindmapThemeMenuPicks({ kind: 'custom', theme: { name: 'Mine' } })).toEqual(['auto', 'light', 'dark', 'custom'])
  })

  it('reads a body that carries its own theme object as custom, without overwriting it', async () => {
    const custom = { name: 'Mine', type: 'dark' }
    const h = scopeHarness(noteSource('- Root'), { theme: { kind: 'custom', theme: custom } })
    try {
      await h.mount(noteSource('- Root'))
      expect(buttonOf(h).textContent).toBe(t('preview.mindmap_theme_custom'))
      // What the menu opens on: the object is the current answer, and it is still there.
      expect(blockThemeOf(h)).toEqual({ kind: 'custom', theme: custom })
      expect(h.records[0]!.options.body.theme).toEqual({ kind: 'custom', theme: custom })
    }
    finally {
      h.dispose()
    }
  })
})

// One edit per pick, into whichever place the fence's format keeps a palette in.
describe('mindmap registry — picking a palette in the block header', () => {
  it('writes the pick into an outline fence and repaints without rebuilding', async () => {
    const fence = fenceWriter(noteSource('- Root', 'theme=dark'))
    const h = scopeHarness(fence.content(), { writeFence: fence.writeFence })
    try {
      await h.mount(fence.content())
      const map = h.records[0]!
      pickMindmapTheme(blockOf(h), 'light')
      expect(fence.patches).toEqual([{ annotation: 'light' }])
      expect(fence.content()).toBe(noteSource('- Root', 'theme=light'))
      expect(map.paints).toEqual([{ dark: false, choice: { kind: 'light' } }])
      expect(map.refreshes).toHaveLength(0)
      expect(buttonOf(h).textContent).toBe(t('preview.mindmap_theme_light'))
    }
    finally {
      h.dispose()
    }
  })

  it('moves a JSON body\'s palette into its own field and clears the annotation', async () => {
    const json = '{\n  "nodeData": { "id": "root", "topic": "Root" }\n}'
    const fence = fenceWriter(noteSource(json, 'theme=light'))
    const h = scopeHarness(fence.content(), { writeFence: fence.writeFence })
    try {
      await h.mount(fence.content())
      pickMindmapTheme(blockOf(h), 'dark')
      // One edit: the field carries the pick and the annotation beside it is dropped, so
      // the two places a palette can live cannot end up disagreeing.
      expect(fence.patches).toHaveLength(1)
      expect(fence.patches[0]!.annotation).toBeNull()
      expect(fence.patches[0]!.body).toContain('"theme": "dark"')
      expect(fence.content()).toContain('```mindmap\n{')
      expect(fence.content()).toContain('"theme": "dark"')
      expect(buttonOf(h).textContent).toBe(t('preview.mindmap_theme_dark'))
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
