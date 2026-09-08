// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import HierarchicalTagsBox from './HierarchicalTagsBox'
import type { BlogTag } from '../../lib/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const MOCK_TAGS: BlogTag[] = [
  { name: 'Inkstone/入门', postsCount: 1 },
  { name: 'Inkstone/markdown', postsCount: 2 },
  { name: '前端/React/状态管理', postsCount: 2 },
  { name: '生活', postsCount: 3 },
]

function renderBox(options: { tags?: BlogTag[]; selectedTag?: string | null; onTagSelect?: (tag: string) => void } = {}) {
  const onTagSelect = options.onTagSelect ?? vi.fn()
  const container = document.createElement('div')
  const root = createRoot(container)
  void act(() => {
    root.render(
      createElement(HierarchicalTagsBox, {
        tags: options.tags ?? MOCK_TAGS,
        selectedTag: options.selectedTag ?? null,
        locale: 'zh-CN',
        onTagSelect,
      })
    )
  })
  return { container, onTagSelect }
}

// React 受控输入需用原型原生 setter 绕过 value tracker
function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function leafButtons(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')].filter((b) => b.textContent?.includes('#'))
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('HierarchicalTagsBox tree rendering', () => {
  it('renders parent groups with aggregated counts and leaf tags', () => {
    const { container } = renderBox()
    expect(container.textContent).toContain('多级标签')
    expect(container.textContent).toContain('Inkstone')
    expect(container.textContent).toContain('#入门')
    expect(container.textContent).toContain('#markdown')
    expect(container.textContent).toContain('生活')
  })

  it('collapses and expands a parent group on chevron click', () => {
    const { container } = renderBox()
    expect(container.textContent).toContain('#入门')

    const chevron = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '折叠')!
    act(() => {
      chevron.click()
    })
    expect(container.textContent).not.toContain('#入门')

    const expand = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '展开')!
    act(() => {
      expand.click()
    })
    expect(container.textContent).toContain('#入门')
  })

  it('keeps ancestors of the selected tag expanded', () => {
    const { container } = renderBox({ selectedTag: 'Inkstone/markdown' })
    expect(container.textContent).toContain('#markdown')
    const markdown = leafButtons(container).find((b) => b.textContent?.includes('#markdown'))!
    expect(markdown.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('HierarchicalTagsBox search', () => {
  it('filters tags by fuzzy substring and keeps the parent branch', () => {
    const { container } = renderBox()
    const input = container.querySelector('input')!
    act(() => {
      typeInto(input, 'markdown')
    })
    expect(container.textContent).toContain('#markdown')
    expect(container.textContent).not.toContain('#入门')
    expect(container.textContent).not.toContain('生活')
  })

  it('matches multi-level labels and shows the path', () => {
    const { container } = renderBox()
    const input = container.querySelector('input')!
    act(() => {
      typeInto(input, '状态管理')
    })
    expect(container.textContent).toContain('#状态管理')
  })

  it('shows the clear button while typing and resets on click', () => {
    const { container } = renderBox()
    const input = container.querySelector('input')!
    act(() => {
      typeInto(input, 'markdown')
    })
    const clearButton = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '清除搜索')!
    expect(clearButton).toBeDefined()
    act(() => {
      clearButton.click()
    })
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('')
    expect(container.textContent).toContain('生活')
  })

  it('shows the empty state when nothing matches', () => {
    const { container } = renderBox()
    const input = container.querySelector('input')!
    act(() => {
      typeInto(input, 'zzz')
    })
    expect(container.textContent).toContain('未找到匹配的标签')
  })
})

describe('HierarchicalTagsBox linkage', () => {
  it('fires onTagSelect with the leaf full name on click', () => {
    const onTagSelect = vi.fn()
    const { container } = renderBox({ onTagSelect })
    const leaf = leafButtons(container).find((b) => b.textContent?.includes('#markdown'))!
    act(() => {
      leaf.click()
    })
    expect(onTagSelect).toHaveBeenCalledWith('Inkstone/markdown')
  })

  it('fires onTagSelect with the parent prefix on group click', () => {
    const onTagSelect = vi.fn()
    const { container } = renderBox({ onTagSelect })
    const parent = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Inkstone') && !b.textContent?.includes('#'))!
    act(() => {
      parent.click()
    })
    expect(onTagSelect).toHaveBeenCalledWith('Inkstone')
  })

  it('renders nothing when there are no tags', () => {
    const { container } = renderBox({ tags: [] })
    expect(container.textContent).toBe('')
  })
})