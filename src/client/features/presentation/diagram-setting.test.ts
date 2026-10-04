import { act, createElement, useRef, type RefObject } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../lib/i18n'
import { installTestGlobals, renderElement } from '../../lib/test-render'
import { useSession } from '../../store/session'
import { createFenceBodies } from '../../lib/markdown/fence-bodies'
import { renderSlideSource, rememberSlideHtml, slideMarkup } from './slide-html'
import { SlideCanvas } from './slide-canvas'
import { usePresenterSlideMedia } from './presenter-view/use-presenter-slide-media'
import type { SlidePlan } from './slide-pagination'
import type { StageMetrics } from './slide-stage'

installTestGlobals()

// 'Display Mermaid code blocks as diagrams' is a display preference, and the note preview already keeps
// it (`use-preview.ts` declines to draw when it is off). These two surfaces did not: the projector's
// canvas and the presenter window each ran their own unconditional draw pass after enhancement, so a
// diagram the account had turned off still arrived (L-5).

// The library is stubbed rather than absent: a case that passed because the import failed would prove
// nothing about the setting. The stub draws, so the only way a diagram can be missing is not asking.
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg class="stub-mermaid"><g></g></svg>' })),
  },
}))

const SLIDE = '# Diagram\n\n```mermaid\nflowchart LR\n  A[Start] --> B[Done]\n```\n'
const METRICS: StageMetrics = { scale: 1, designWidth: 1280, designHeight: 720, contentWidth: 1168, contentHeight: 632 }

function setMermaidSetting(on: boolean) {
  useSession.setState((state) => ({
    settings: { ...state.settings, preview: { ...state.settings.preview, mermaid: on } },
  }))
}

// A diagram arrives through a dynamic import and a queued render, so "off" cannot be read from the first
// frame that looks right — the enhancement writes the source and the draw lands after it. Poll for the
// drawn case, and for the turned-off case let the whole chain finish before saying anything.
async function drawnDiagram(host: HTMLElement): Promise<Element | null> {
  for (let beat = 0; beat < 60; beat++) {
    const svg = host.querySelector('[data-mermaid] svg')
    if (svg) return svg
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }
  return null
}

async function letTheChainFinish(): Promise<void> {
  for (let beat = 0; beat < 10; beat++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
    })
  }
}

beforeAll(async () => {
  await initI18n()
})

afterEach(() => {
  setMermaidSetting(true)
  document.body.innerHTML = ''
})

function Projector({ cacheKey, source }: { cacheKey: string; source: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const onPlan = (plan: SlidePlan) => { void plan }
  return createElement('div', { ref }, createElement(SlideCanvas, {
    cacheKey,
    source,
    subPage: 0,
    contentWidth: METRICS.contentWidth,
    contentHeight: METRICS.contentHeight,
    onPlan,
  }))
}

describe('the projector honours the diagram setting', () => {
  it('draws the diagram when the account asked for diagrams', async () => {
    setMermaidSetting(true)
    const cacheKey = 'setting-on'
    rememberSlideHtml(cacheKey, { ...slideMarkup(renderSlideSource(SLIDE, false)), prepared: true })
    const view = renderElement(createElement(Projector, { cacheKey, source: SLIDE }))
    const host = view.container
    const svg = await drawnDiagram(host)
    expect(svg, 'the stub draws, so a missing diagram here means the canvas never asked').toBeTruthy()
    view.unmount()
  })

  it('leaves the source on screen when the account turned diagrams off', async () => {
    setMermaidSetting(false)
    const cacheKey = 'setting-off'
    rememberSlideHtml(cacheKey, { ...slideMarkup(renderSlideSource(SLIDE, false)), prepared: true })
    const view = renderElement(createElement(Projector, { cacheKey, source: SLIDE }))
    const host = view.container
    await letTheChainFinish()
    // What "off" means for this surface: nobody asked the library to draw. Rendering the source rather
    // than a skeleton is the enhancement chain's job; what these two surfaces must not do is undo its
    // answer with a draw pass of their own.
    expect(host.querySelector('[data-mermaid] svg'), 'a turned-off diagram must not be drawn by the projector').toBeNull()
    expect(host.querySelector('[data-mermaid]')?.getAttribute('data-rendered'), 'and it must not claim a rendering it did not do').toBeNull()
    // Whether a turned-off projector paints the *source* or the skeleton is decided by the preparation
    // that wrote this page (it is the chain that shows source), not by this surface; the entry seeded
    // here is a plain render, so the only thing this case can honestly read is "nobody drew".
    view.unmount()
  })
})

function Pane({ hostRef, html }: { hostRef: RefObject<HTMLElement | null>; html: string }) {
  usePresenterSlideMedia({ hostRef, html, fences: createFenceBodies(), dark: false, metrics: METRICS })
  return null
}

describe('the presenter window honours the diagram setting', () => {
  it('draws the same picture the room is looking at, when diagrams are on', async () => {
    setMermaidSetting(true)
    const host = document.createElement('div')
    document.body.append(host)
    const html = renderSlideSource(SLIDE, false).html
    host.innerHTML = html
    const hostRef = { current: host } as RefObject<HTMLElement | null>
    const view = renderElement(createElement(Pane, { hostRef, html }))
    expect(await drawnDiagram(host)).toBeTruthy()
    view.unmount()
  })

  it('shows the fence source instead when the account turned diagrams off', async () => {
    setMermaidSetting(false)
    const host = document.createElement('div')
    document.body.append(host)
    const html = renderSlideSource(SLIDE, false).html
    host.innerHTML = html
    const hostRef = { current: host } as RefObject<HTMLElement | null>
    const view = renderElement(createElement(Pane, { hostRef, html }))
    await letTheChainFinish()
    expect(host.querySelector('[data-mermaid] svg'), 'the presenter reads what the room reads, including its settings').toBeNull()
    expect(host.querySelector('[data-mermaid] code')?.textContent).toContain('flowchart')
    view.unmount()
  })
})
