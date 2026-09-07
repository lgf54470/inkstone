// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import HomePagination from './HomePagination'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('HomePagination page size selector options', () => {
  it('renders selector with options and displays total count', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onPageChange = vi.fn()
    const onPageSizeChange = vi.fn()

    await act(async () => {
      root.render(
        createElement(HomePagination, {
          currentPage: 1,
          totalPages: 5,
          pageSize: 10,
          total: 48,
          locale: 'zh-CN',
          onPageChange,
          onPageSizeChange,
        })
      )
    })

    const select = container.querySelector('select')
    expect(select).not.toBeNull()
    expect(select?.value).toBe('10')
    expect(container.textContent).toContain('共 48 篇')

    const options = container.querySelectorAll('option')
    expect(options.length).toBe(4)
    expect(options[0]?.textContent).toContain('5 条/页')
    expect(options[1]?.textContent).toContain('10 条/页')
  })
})

describe('HomePagination page size selection change', () => {
  it('triggers onPageSizeChange when selection changes', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onPageSizeChange = vi.fn()

    await act(async () => {
      root.render(
        createElement(HomePagination, {
          currentPage: 1,
          totalPages: 5,
          pageSize: 10,
          total: 48,
          onPageChange: vi.fn(),
          onPageSizeChange,
        })
      )
    })

    const select = container.querySelector('select')
    await act(async () => {
      if (select) {
        select.value = '20'
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })

    expect(onPageSizeChange).toHaveBeenCalledWith(20)
  })
})

describe('HomePagination page button states', () => {
  it('disables prev button on page 1 and enables next button', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        createElement(HomePagination, {
          currentPage: 1,
          totalPages: 3,
          pageSize: 10,
          total: 25,
          locale: 'zh-CN',
          onPageChange: vi.fn(),
          onPageSizeChange: vi.fn(),
        })
      )
    })

    const buttons = container.querySelectorAll<HTMLButtonElement>('button')
    const prevBtn = buttons[0]
    const nextBtn = buttons[buttons.length - 1]

    expect(prevBtn?.disabled).toBe(true)
    expect(nextBtn?.disabled).toBe(false)
  })
})

describe('HomePagination page change trigger', () => {
  it('triggers onPageChange when clicking page number or next', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onPageChange = vi.fn()

    await act(async () => {
      root.render(
        createElement(HomePagination, {
          currentPage: 1,
          totalPages: 3,
          pageSize: 10,
          total: 25,
          locale: 'zh-CN',
          onPageChange,
          onPageSizeChange: vi.fn(),
        })
      )
    })

    const buttons = container.querySelectorAll<HTMLButtonElement>('button')
    const page2Btn = Array.from(buttons).find((b) => b.textContent === '2')
    await act(async () => {
      page2Btn?.click()
    })

    expect(onPageChange).toHaveBeenCalledWith(2)
  })
})
