import type { APIRoute } from 'astro'
import { api } from '../lib/api'
import { escapeXml } from '../lib/xml'

/** RSS 订阅源最新文章数（接口单次分页上限） */
const FEED_POST_LIMIT = 50

/**
 * 动态 RSS 2.0 订阅源：基于 getPosts 最新文章（含摘要），
 * origin 自适应环境；feed 本身可被 CDN 缓存（middleware 已设 max-age=3600）。
 * 独立为纯函数便于单测（tests/endpoints.test.ts）。
 */
export async function getFeedXml(url: URL): Promise<Response> {
  const origin = url.origin
  const [siteInfo, postsData] = await Promise.all([api.getSiteInfo(), api.getPosts({ limit: FEED_POST_LIMIT })])

  const items = postsData.posts.map((post) => {
    const link = `${origin}/posts/${post.slug}`
    const pubDate = new Date(post.publishedAt || post.createdAt).toUTCString()
    return [
      '  <item>',
      `    <title>${escapeXml(post.title)}</title>`,
      `    <link>${escapeXml(link)}</link>`,
      `    <guid isPermaLink="true">${escapeXml(link)}</guid>`,
      post.excerpt ? `    <description>${escapeXml(post.excerpt)}</description>` : '',
      `    <pubDate>${pubDate}</pubDate>`,
      '  </item>',
    ].join('\n')
  })

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(siteInfo.siteName)}</title>`,
    `    <link>${origin}/</link>`,
    `    <description>${escapeXml(siteInfo.bio || siteInfo.subtitle)}</description>`,
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(`${origin}/feed.xml`)}" rel="self" type="application/rss+xml" />`,
    ...items,
    '  </channel>',
    '</rss>',
  ].join('\n')

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}

export const GET: APIRoute = ({ url }) => getFeedXml(url)