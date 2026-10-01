import type { APIRoute } from 'astro'
import { api } from '../lib/api'
import { serviceUnavailable } from '../lib/service-unavailable'
import { escapeXml } from '../lib/xml'

const STATIC_ROUTES = ['/', '/timeline', '/categories', '/tags', '/links']

interface SitemapUrl {
  loc: string
  lastmod?: string
}

/**
 * 动态 sitemap：以请求 origin 自适应多环境（本地/预览/生产），
 * 文章 slug 来自 timeline（覆盖全部已发布文章，并带每篇的最后编辑时刻），分类与标签页从各自的
 * 公开列表来。三处任一取不到都回 503 + no-store（BF-1）：只含静态路由的「成功」sitemap 会让
 * 搜索引擎以为这些页面都消失了，5xx 则会被当作一次失败延后重试。
 * 独立为纯函数便于单测（tests/endpoints.test.ts）。
 */
export async function getSitemapXml(url: URL): Promise<Response> {
  const origin = url.origin
  const data = await Promise.all([
    api.getTimeline(),
    // strict：分类/标签列表在普通页面里为空只是「少一块内容」，在这里等于「这些页面不存在」。
    api.getCategories({ strict: true }),
    api.getTags({ strict: true }),
  ]).catch((err: unknown) => {
    console.error('[sitemap] blog data unavailable:', err)
    return null
  })
  if (!data) return serviceUnavailable('xml')
  const [timeline, categories, tags] = data

  const postEntries = new Map<string, SitemapUrl>()
  for (const group of timeline) {
    for (const month of group.months) {
      // A noindex post is deliberately absent from the index; listing it would invite the crawler
      // back to a page that asked not to be indexed.
      for (const post of month.posts.filter((entry) => !entry.noindex)) {
        postEntries.set(post.slug, {
          loc: `${origin}/posts/${post.slug}`,
          lastmod: sitemapLastmod(post.updatedAt || post.publishedAt),
        })
      }
    }
  }

  const urls: SitemapUrl[] = [
    ...STATIC_ROUTES.map((path) => ({ loc: `${origin}${path}` })),
    ...categories.filter((category) => category.slug).map((category) => ({ loc: `${origin}/categories/${category.slug}` })),
    ...tags.filter((tag) => tag.name).map((tag) => ({ loc: `${origin}/tags/${encodeURIComponent(tag.name)}` })),
    ...postEntries.values(),
  ]
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((entry) => `  <url><loc>${escapeXml(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''}</url>`),
    '</urlset>',
  ].join('\n')

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}

/** W3C datetime for a sitemap; an unusable moment is omitted rather than sent as an epoch date. */
function sitemapLastmod(timestamp: number): string | undefined {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined
  return new Date(timestamp).toISOString()
}

export const GET: APIRoute = ({ url }) => getSitemapXml(url)
