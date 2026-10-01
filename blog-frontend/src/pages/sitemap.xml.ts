import type { APIRoute } from 'astro'
import { api } from '../lib/api'
import { serviceUnavailable } from '../lib/service-unavailable'
import { escapeXml } from '../lib/xml'

const STATIC_ROUTES = ['/', '/timeline', '/categories', '/tags']

/**
 * 动态 sitemap：以请求 origin 自适应多环境（本地/预览/生产），
 * 文章列表来自 timeline 接口（覆盖全部已发布文章）。
 * 独立为纯函数便于单测（tests/endpoints.test.ts）。
 */
export async function getSitemapXml(url: URL): Promise<Response> {
  const origin = url.origin
  // 取不到全部文章时回 503 + no-store（BF-1）：只含静态路由的「成功」sitemap 会让搜索引擎
  // 以为文章都消失了，5xx 则会被当作一次失败延后重试。
  const timeline = await api.getTimeline().catch((err: unknown) => {
    console.error('[sitemap] timeline unavailable:', err)
    return null
  })
  if (!timeline) return serviceUnavailable('xml')
  const postSlugs = new Set<string>()
  for (const group of timeline) {
    for (const month of group.months) {
      for (const post of month.posts) postSlugs.add(post.slug)
    }
  }

  const urls = [
    ...STATIC_ROUTES.map((path) => `${origin}${path}`),
    ...[...postSlugs].map((slug) => `${origin}/posts/${slug}`),
  ]
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`),
    '</urlset>',
  ].join('\n')

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}

export const GET: APIRoute = ({ url }) => getSitemapXml(url)