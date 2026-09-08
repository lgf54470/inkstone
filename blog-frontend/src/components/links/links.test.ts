// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import type { BlogPublicLink, BlogPublicLinkCategory } from '../../lib/types'
import { LinkCard } from './link-card'
import { SEARCH_ENGINES } from './search-engines'
import { useLinksState } from './use-links-state'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const MOCK_CATEGORIES: BlogPublicLinkCategory[] = [
  { id: 'cat-tech', name: '技术开发', sortOrder: 1 },
  { id: 'cat-frontend', name: '前端工具', parentId: 'cat-tech', sortOrder: 1 },
  { id: 'cat-life', name: '生活随笔', sortOrder: 2 },
]

const MOCK_LINKS: BlogPublicLink[] = [
  {
    id: 'link-1',
    name: 'Vue.js',
    url: 'https://vuejs.org',
    description: '渐进式 JavaScript 框架',
    avatar: 'https://vuejs.org/logo.png',
    categoryId: 'cat-frontend',
    sortOrder: 1,
    isPinned: false,
    clicks: 10,
    status: 'approved',
    createdAt: 1000,
    updatedAt: 1000,
  },
  {
    id: 'link-2',
    name: 'Astro',
    url: 'https://astro.build',
    description: '快速内容驱动的网站框架',
    avatar: null,
    categoryId: 'cat-frontend',
    sortOrder: 2,
    isPinned: true,
    clicks: 50,
    status: 'approved',
    createdAt: 2000,
    updatedAt: 2000,
  },
  {
    id: 'link-3',
    name: '生活日常',
    url: 'https://daily.example.com',
    description: '生活与思考',
    avatar: null,
    categoryId: 'cat-life',
    sortOrder: 3,
    isPinned: false,
    clicks: 5,
    status: 'approved',
    createdAt: 3000,
    updatedAt: 3000,
  },
]

describe('SEARCH_ENGINES', () => {
  it('defines 12 major search engines with correct query URL encoding', () => {
    expect(SEARCH_ENGINES.length).toBe(12)
    const google = SEARCH_ENGINES.find((e) => e.id === 'google')
    expect(google).toBeDefined()
    expect(google?.url('hello world')).toBe('https://www.google.com/search?q=hello%20world')

    const github = SEARCH_ENGINES.find((e) => e.id === 'github')
    expect(github).toBeDefined()
    expect(github?.url('astro')).toBe('https://github.com/search?q=astro')
  })
})

describe('LinkCard rendering', () => {
  it('renders detailed card with title, url and pinned status', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => {
      root.render(
        createElement(LinkCard, {
          link: MOCK_LINKS[1],
          categoryName: '前端工具',
          isFavorite: false,
          isPinned: true,
          viewMode: 'detailed',
          onToggleFavorite: () => {},
          onContextMenu: () => {},
          onVisit: () => {},
        }),
      )
    })

    expect(container.textContent).toContain('Astro')
    expect(container.textContent).toContain('快速内容驱动的网站框架')
    expect(container.textContent).toContain('前端工具')
  })

  it('renders simple card with minimal title display', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => {
      root.render(
        createElement(LinkCard, {
          link: MOCK_LINKS[0],
          categoryName: '前端工具',
          isFavorite: true,
          isPinned: false,
          viewMode: 'simple',
          onToggleFavorite: () => {},
          onContextMenu: () => {},
          onVisit: () => {},
        }),
      )
    })

    expect(container.textContent).toContain('Vue.js')
  })
})

describe('useLinksState hook', () => {
  it('orders pinned links before unpinned links initially', () => {
    let hookState!: ReturnType<typeof useLinksState>
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => {
      root.render(createElement(StateHarness, { onState: (s) => { hookState = s } }))
    })

    expect(hookState.filteredLinks[0].name).toBe('Astro')
  })

  it('filters links by search query', () => {
    let hookState!: ReturnType<typeof useLinksState>
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => {
      root.render(createElement(StateHarness, { onState: (s) => { hookState = s } }))
    })

    act(() => {
      hookState.setSearchQuery('Vue')
    })

    expect(hookState.filteredLinks.length).toBe(1)
    expect(hookState.filteredLinks[0].name).toBe('Vue.js')
  })
})

function StateHarness({ onState }: { onState: (s: ReturnType<typeof useLinksState>) => void }) {
  const state = useLinksState(MOCK_LINKS, MOCK_CATEGORIES)
  onState(state)
  return null
}
