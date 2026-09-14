/**
 * The one place the real library meets a test. jsdom never lays the map out, and it
 * does not have to: what is asserted here is the palette an instance paints, which the
 * library writes as inline styles on the element it draws in, plus the branch colour it
 * bakes into the connectors when it draws them. The registry tests drive a stub because
 * they are about adoption; this one drives mind-elixir itself, which is the only way to
 * see a body's own `theme` reach the instance that draws (see ./theme).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { APP_THEME_CHOICE, type MindmapThemeChoice } from './theme'
import type { MindmapCreateOptions, MindmapHandle, MindmapParsedBody } from './types'
import { createMindmapVendor } from './vendor'

// mind-elixir's own two palettes (dist), as the library writes them.
const LIGHT_ROOT = '#4c4f69'
const DARK_ROOT = '#2d3748'

// A theme object in the library's own shape, naming only a colour variable: the palette
// it does not carry has to come from the base its `type` names.
const CUSTOM_THEME: MindmapThemeChoice = {
  kind: 'custom',
  theme: { name: 'Mine', type: 'light', cssVar: { '--root-bgcolor': '#abcdef' } },
}

beforeAll(() => {
  // The library reaches for both while it initializes and jsdom implements neither: it
  // observes its element's size, and it asks the media queries behind its touch and
  // colour-scheme behaviour.
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
})

function parsedBody(theme: MindmapThemeChoice): MindmapParsedBody {
  return {
    data: { nodeData: { id: 'root', topic: 'Root', children: [{ id: 'a', topic: 'Child' }] } },
    extra: {},
    theme,
  }
}

/** Draws one map and always destroys it: an instance owns DOM nodes and listeners. */
function mountAndRun(theme: MindmapThemeChoice, dark: boolean, run: (map: { el: HTMLElement; handle: MindmapHandle }) => void): void {
  const el = document.createElement('div')
  document.body.append(el)
  const options: MindmapCreateOptions = {
    el,
    body: parsedBody(theme),
    editable: true,
    dark,
    locale: 'en-US',
    newTopicName: 'New node',
    modifierWheelZoom: true,
    onOperation: () => {},
    onEditingChange: () => {},
  }
  const handle = createMindmapVendor().create(options)
  try {
    run({ el, handle })
  }
  finally {
    handle.destroy()
    el.remove()
  }
}

/** What the map paints from its own theme: the colour variable and a branch colour. */
function painted(el: HTMLElement) {
  const branch = [...el.querySelectorAll<HTMLElement>('me-tpc')]
    .map((node) => node.style.borderColor)
    .find((color) => color.length > 0) ?? ''
  return {
    root: el.querySelector<HTMLElement>('.map-container')?.style.getPropertyValue('--root-bgcolor').trim() ?? '',
    branch,
  }
}

function expectRoot(el: HTMLElement, root: string): void {
  expect(painted(el).root).toBe(root)
}

/** The app's setting changes on its own; the body's own choice is carried along. */
function switchAppearance(handle: MindmapHandle, dark: boolean, choice: MindmapThemeChoice = APP_THEME_CHOICE): void {
  handle.applyTheme({ dark, choice })
}

describe('mind map vendor — the palette the app setting picks', () => {
  it('follows the app setting when the body names no palette', () => {
    mountAndRun(APP_THEME_CHOICE, false, (map) => expectRoot(map.el, LIGHT_ROOT))
    mountAndRun(APP_THEME_CHOICE, true, (map) => expectRoot(map.el, DARK_ROOT))
  })

  it('hands an app switch to the live map instead of only the next one', () => {
    mountAndRun(APP_THEME_CHOICE, false, (map) => {
      expectRoot(map.el, LIGHT_ROOT)
      switchAppearance(map.handle, true)
      expectRoot(map.el, DARK_ROOT)
    })
  })

  it('repaints the branches, not only the colour variables', () => {
    mountAndRun(APP_THEME_CHOICE, false, (map) => {
      const lightBranch = painted(map.el).branch
      expect(lightBranch.length).toBeGreaterThan(0)
      switchAppearance(map.handle, true)
      const darkBranch = painted(map.el).branch
      expect(darkBranch.length).toBeGreaterThan(0)
      expect(darkBranch).not.toBe(lightBranch)
    })
  })
})

// The other half of the rule: a body that names a palette keeps it (./theme).
describe('mind map vendor — the palette a body names', () => {
  it('draws the palette the body named, whatever the app setting is', () => {
    mountAndRun({ kind: 'dark' }, false, (map) => expectRoot(map.el, DARK_ROOT))
    mountAndRun({ kind: 'light' }, true, (map) => expectRoot(map.el, LIGHT_ROOT))
  })

  it('leaves a map that named its own palette alone when the app switches', () => {
    mountAndRun({ kind: 'dark' }, false, (map) => {
      switchAppearance(map.handle, true, { kind: 'dark' })
      switchAppearance(map.handle, false, { kind: 'dark' })
      expectRoot(map.el, DARK_ROOT)
    })
  })

  it('loads the palette a new body asks for into the live map', () => {
    mountAndRun(APP_THEME_CHOICE, false, (map) => {
      expectRoot(map.el, LIGHT_ROOT)
      map.handle.refresh(parsedBody({ kind: 'dark' }))
      expectRoot(map.el, DARK_ROOT)
    })
  })

  it('lays a custom theme over the base its type names, so a missing palette still draws', () => {
    mountAndRun(CUSTOM_THEME, true, (map) => {
      expectRoot(map.el, '#abcdef')
      expect(painted(map.el).branch.length).toBeGreaterThan(0)
    })
  })
})
