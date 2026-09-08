// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import SearchInput from './SearchInput'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function renderInput(props: {
  value: string
  onChange?: (value: string) => void
  loading?: boolean
  trailingEmpty?: React.ReactNode
  variant?: 'boxed' | 'bare'
}) {
  const onChange = props.onChange ?? vi.fn()
  const container = document.createElement('div')
  const root = createRoot(container)
  void act(() => {
    root.render(
      createElement(SearchInput, {
        value: props.value,
        onChange,
        placeholder: '搜索',
        ariaLabel: '搜索框',
        clearLabel: '清除',
        loading: props.loading,
        trailingEmpty: props.trailingEmpty,
        variant: props.variant,
      })
    )
  })
  return { container, onChange }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('SearchInput clear button', () => {
  it('shows the clear button only when the input has content', () => {
    const empty = renderInput({ value: '' })
    expect([...empty.container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '清除')).toBeUndefined()

    const filled = renderInput({ value: 'abc' })
    expect([...filled.container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '清除')).toBeDefined()
  })

  it('clears the value through onChange when clicked', () => {
    const { container, onChange } = renderInput({ value: 'abc' })
    const clear = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '清除')!
    act(() => {
      clear.click()
    })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('shows the spinner instead of the clear button while loading', () => {
    const { container } = renderInput({ value: 'abc', loading: true })
    expect([...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '清除')).toBeUndefined()
    expect(container.querySelector('svg.animate-spin')).not.toBeNull()
  })

  it('renders trailing content when empty and idle', () => {
    const { container } = renderInput({ value: '', trailingEmpty: createElement('span', { key: 'hint' }, 'ESC') })
    expect(container.textContent).toContain('ESC')
  })
})