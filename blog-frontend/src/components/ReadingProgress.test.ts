// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import ReadingProgress from './ReadingProgress'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function renderProgress(): { container: HTMLDivElement } {
  const container = document.createElement('div')
  const root = createRoot(container)
  void act(() => {
    root.render(createElement(ReadingProgress, { initialLocale: 'zh-CN' }))
  })
  return { container }
}

function setScrollState(scrollY: number, scrollHeight: number, innerHeight: number): void {
  Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true, writable: true })
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: scrollHeight, configurable: true, writable: true })
}

function flushFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

beforeEach(() => {
  document.body.innerHTML = ''
  setScrollState(0, 2000, 800)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ReadingProgress', () => {
  it('is hidden at the top of the page', () => {
    const { container } = renderProgress()
    const bar = container.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('0')
    expect(bar.className).toContain('opacity-0')
  })

  it('updates progress on scroll and becomes visible', async () => {
    const { container } = renderProgress()
    setScrollState(600, 2000, 800) // 600 / (2000-800) = 0.5
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    await act(async () => {
      await flushFrame()
    })

    const bar = container.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('50')
    expect(bar.className).toContain('opacity-100')
  })

  it('clamps progress at 100% when scrolled past the end', async () => {
    const { container } = renderProgress()
    setScrollState(99999, 2000, 800)
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    await act(async () => {
      await flushFrame()
    })

    const bar = container.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('100')
  })

  it('scrolls back to top when clicked', async () => {
    const { container } = renderProgress()
    setScrollState(600, 2000, 800)
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    await act(async () => {
      await flushFrame()
    })

    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const bar = container.querySelector('[role="progressbar"]')!
    act(() => {
      bar.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })
})