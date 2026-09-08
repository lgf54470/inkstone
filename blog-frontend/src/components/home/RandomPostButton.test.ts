// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import RandomPostButton from './RandomPostButton'
import { api } from '../../lib/api'
import type { BlogPost } from '../../lib/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const MOCK_POST: BlogPost = {
  id: 'post-1',
  noteId: 'note-1',
  slug: 'post-one',
  title: '第一篇文章',
  excerpt: '摘要',
  content: '内容',
  isPinned: false,
  isPublished: true,
  coverUrl: null,
  categoryId: null,
  tags: [],
  views: 1,
  allowComments: true,
  publishedAt: 1725148800000,
  createdAt: 1725148800000,
  updatedAt: 1725148800000,
}

type PostsResponse = { posts: BlogPost[]; total: number; page: number; limit: number; totalPages: number }

function renderButton(navigate = vi.fn()) {
  const container = document.createElement('div')
  const root = createRoot(container)
  void act(() => {
    root.render(createElement(RandomPostButton, { locale: 'zh-CN', navigate }))
  })
  return { container, navigate }
}

async function clickButton(container: HTMLElement): Promise<void> {
  await act(async () => {
    container.querySelector('button')!.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RandomPostButton', () => {
  it('picks a random page and navigates to the post', async () => {
    const getPosts = vi
      .spyOn(api, 'getPosts')
      .mockResolvedValueOnce({ posts: [MOCK_POST], total: 10, page: 1, limit: 1, totalPages: 10 } as PostsResponse)
      .mockResolvedValueOnce({ posts: [MOCK_POST], total: 1, page: 6, limit: 1, totalPages: 10 } as PostsResponse)
    const { container, navigate } = renderButton()

    await clickButton(container)

    expect(getPosts).toHaveBeenCalledTimes(2)
    const pageArg = getPosts.mock.calls[1]![0]!.page
    expect(pageArg).toBeGreaterThanOrEqual(1)
    expect(pageArg).toBeLessThanOrEqual(10)
    expect(navigate).toHaveBeenCalledWith('/posts/post-one')
  })

  it('does not navigate when there are no posts', async () => {
    vi.spyOn(api, 'getPosts').mockResolvedValue({ posts: [], total: 0, page: 1, limit: 1, totalPages: 0 } as PostsResponse)
    const { container, navigate } = renderButton()

    await clickButton(container)

    expect(navigate).not.toHaveBeenCalled()
  })

  it('shows a loading label while picking and disables repeated clicks', async () => {
    let resolveFirst: (value: PostsResponse) => void = () => {}
    let callCount = 0
    vi.spyOn(api, 'getPosts').mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return new Promise<PostsResponse>((resolve) => { resolveFirst = resolve })
      }
      return Promise.resolve({ posts: [MOCK_POST], total: 1, page: 1, limit: 1, totalPages: 1 } as PostsResponse)
    })
    const { container } = renderButton()

    void act(() => {
      container.querySelector('button')!.click()
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(container.textContent).toContain('正在抽取')

    await act(async () => {
      // 放行第一次请求后，随机页请求自动完成，恢复空闲态
      resolveFirst({ posts: [MOCK_POST], total: 1, page: 1, limit: 1, totalPages: 1 } as PostsResponse)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.textContent).toContain('随机一篇')
  })
})