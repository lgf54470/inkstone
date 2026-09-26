import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { MusicFloatingPlayer, MusicImmersiveOverlay } from './index'
import { useMusic } from './music-store'

const counter = vi.hoisted(() => ({ floating: 0, immersive: 0 }))

// Counting module evaluation is the point: an eager import in the shell's graph
// costs every session the chunk, while a lazy one costs only the sessions that
// actually open the surface.
vi.mock('./music-floating-player', async () => {
  counter.floating += 1
  return { MusicFloatingPlayer: () => createElement('div', { id: 'floating-card' }) }
})

vi.mock('./music-immersive-player', async () => {
  counter.immersive += 1
  return { MusicImmersivePlayer: () => createElement('div', { id: 'immersive-layer' }) }
})

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null

async function mount(node: () => unknown): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(node() as never)
  })
  // The lazy import settles in a follow-up microtask, outside the first render.
  await act(async () => {})
}

beforeEach(() => {
  useMusic.setState({ floatingVisible: false, immersive: false })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ floatingVisible: false, immersive: false })
})

describe('music overlays load on demand (PERF-11)', () => {
  it('leaves the floating player unimported while it cannot be shown', async () => {
    await mount(() => createElement(MusicFloatingPlayer))
    expect(counter.floating).toBe(0)
    expect(document.getElementById('floating-card')).toBeNull()
  })

  it('imports and mounts the floating player once it is visible', async () => {
    useMusic.setState({ floatingVisible: true })
    await mount(() => createElement(MusicFloatingPlayer))
    expect(counter.floating).toBe(1)
    expect(document.getElementById('floating-card')).not.toBeNull()
  })

  it('leaves the immersive player unimported until it is opened', async () => {
    await mount(() => createElement(MusicImmersiveOverlay))
    expect(counter.immersive).toBe(0)

    await act(async () => {
      useMusic.setState({ immersive: true })
    })
    await act(async () => {})
    expect(counter.immersive).toBe(1)
    expect(document.getElementById('immersive-layer')).not.toBeNull()
  })
})
