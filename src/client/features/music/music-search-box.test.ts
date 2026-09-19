import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { renderElement } from '../../lib/test-render'
import { SearchBox, SEARCH_DEBOUNCE_MS } from './music-search-box'
import { useMusic } from './music-store'

let historyRendered: ReturnType<typeof renderElement> | null = null

afterEach(() => {
  act(() => historyRendered?.unmount())
  historyRendered = null
  document.body.innerHTML = ''
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

function pressKey(input: HTMLInputElement, key: string): void {
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

// UI-22: the history dropdown is a popup list attached to the input; without
// combobox semantics a screen-reader user cannot see it open or walk its rows.
describe('music search history combobox semantics', () => {
  function mountWithHistory(): HTMLInputElement {
    act(() => { useMusic.setState({ searchHistory: ['jazz', 'moon'] }) })
    historyRendered = renderElement(createElement(SearchBox))
    const input = inputOf(historyRendered.container)
    act(() => { input.focus() })
    return input
  }

  it('wires the opened list to the input', () => {
    const input = mountWithHistory()
    const listbox = document.querySelector('[role="listbox"]') as HTMLElement | null
    expect(listbox).not.toBeNull()
    const options = [...listbox!.querySelectorAll('[role="option"]')]
    expect(options.map((option) => option.textContent?.trim())).toEqual(['jazz', 'moon'])
    expect(input.getAttribute('role')).toBe('combobox')
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(input.getAttribute('aria-controls')).toBe(listbox!.id)
    expect(options[0]?.getAttribute('aria-selected')).toBe('false')
  })

  it('walks the entries with the arrow keys and commits the highlighted one on Enter', () => {
    const input = mountWithHistory()
    const options = [...document.querySelectorAll('[role="option"]')]
    pressKey(input, 'ArrowDown')
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]!.id)
    expect(options[0]?.getAttribute('aria-selected')).toBe('true')
    pressKey(input, 'ArrowDown')
    pressKey(input, 'ArrowUp')
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]!.id)
    pressKey(input, 'Enter')
    expect(useMusic.getState().query).toBe('jazz')
    expect(document.querySelector('[role="listbox"]')).toBeNull()
  })
})
