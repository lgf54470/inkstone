import { api } from './api'
import type { BlogPost } from './types'
import { getPageUrl, parsePositiveInt } from './pagination'

export interface SearchPageData {
  query: string
  posts: BlogPost[]
  total: number
  page: number
  totalPages: number
}

/**
 * 可分享的搜索页（FEA-12）：`/search?q=...&page=n` 自己带着查询与页码，所以任何结果页都能贴给别人，
 * 也能被浏览器前进后退与刷新复原。解析与取数都收在这里，页面只负责画。
 */
export function parseSearchQuery(url: URL): string {
  return (url.searchParams.get('q') ?? '').trim()
}

export function parseSearchPage(url: URL): number {
  return parsePositiveInt(url.searchParams.get('page'), 1)
}

/** 搜索页的基地址（不含页码），可直接喂给分页组件当 baseUrl。 */
export function searchPageBase(query: string): string {
  return `/search?${new URLSearchParams({ q: query }).toString()}`
}

export function searchPageHref(query: string, page: number): string {
  return getPageUrl(page, searchPageBase(query))
}

/**
 * 取一页搜索结果。空查询不发请求（没有要搜的东西）；取数失败向上抛，由页面答 503 而不是画一个
 * 「没有结果」的空页——那会让读者与爬虫把一次失败当成搜索结论。
 */
export async function loadSearchPage(query: string, page: number, limit: number): Promise<SearchPageData> {
  if (!query) return { query, posts: [], total: 0, page: 1, totalPages: 0 }
  const data = await api.getPosts({ search: query, page, limit })
  return { query, posts: data.posts, total: data.total, page: data.page, totalPages: data.totalPages }
}
