import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { renderElement } from '../../lib/test-render'
import { SearchBox, SEARCH_DEBOUNCE_MS } from './music-search-box'
import { useMusic } from './music-store'

afterEach(() => {
  vi.useRealTimers()
  useMusic.setState({ query: '', searchHistory: [] })
})

function inputOf(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input') as HTMLInputElement
}

function typeText(input: HTMLInputElement, value: string): void {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setValue?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function pressEnter(input: HTMLInputElement): void {
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}

describe('music search box debounce', () => {
  it('waits out the debounce window before touching the store', () => {
    vi.useFakeTimers()
    const rendered = renderElement(createElement(SearchBox))
    const input = inputOf(rendered.container)

    typeText(input, 'moon')
    expect(input.value).toBe('moon')
    expect(useMusic.getState().query).toBe('')

    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1) })
    expect(useMusic.getState().query).toBe('')

    act(() => { vi.advanceTimersByTime(1) })
    expect(useMusic.getState().query).toBe('moon')
    rendered.unmount()
  })

  it('collapses a burst of keystrokes into the final value only', () => {
    vi.useFakeTimers()
    const rendered = renderElement(createElement(SearchBox))
    const input = inputOf(rendered.container)

    typeText(input, 'm')
    typeText(input, 'mo')
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS / 2) })
    typeText(input, 'moo')
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS) })

    expect(useMusic.getState().query).toBe('moo')
    expect(input.value).toBe('moo')
    rendered.unmount()
  })
})

describe('music search box commit', () => {
  it('commits immediately on Enter and records the search history', () => {
    const rendered = renderElement(createElement(SearchBox))
    const input = inputOf(rendered.container)

    typeText(input, 'moon')
    pressEnter(input)

    expect(useMusic.getState().query).toBe('moon')
    expect(useMusic.getState().searchHistory).toEqual(['moon'])
    rendered.unmount()
  })

  it('adopts a query changed from outside the box', () => {
    const rendered = renderElement(createElement(SearchBox))

    act(() => { useMusic.setState({ query: 'outside' }) })

    expect(inputOf(rendered.container).value).toBe('outside')
    rendered.unmount()
  })
})
