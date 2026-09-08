import type { APIRoute } from 'astro'
import { api } from '../lib/api'

const STATIC_ROUTES = ['/', '/timeline', '/calendar', '/categories', '/tags']

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    const table: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }
    return table[ch]!
  })
}

/**
 * 动态 sitemap：以请求 origin 自适应多环境（本地/预览/生产），
 * 文章列表来自 timeline 接口（覆盖全部已发布文章）。
 */
export const GET: APIRoute = async ({ url }) => {
  const origin = url.origin
  const timeline = await api.getTimeline()
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