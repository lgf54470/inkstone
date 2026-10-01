/**
 * 数据源不可用时页面与端点的回答（BF-1）。5xx 让爬虫与 RSS 阅读器把这次取数当作失败并稍后
 * 重试，而不是把空文档或演示内容当真内容收录；`no-store` 防止边缘把一次瞬时故障缓存住。页面
 * 的 HTML 与 feed/sitemap 的 XML 各有自己的 content-type，共用这一个出口以免三处漂移。
 */
export function serviceUnavailable(kind: 'html' | 'rss' | 'xml'): Response {
  const contentType =
    kind === 'html'
      ? 'text/html; charset=utf-8'
      : kind === 'rss'
        ? 'application/rss+xml; charset=utf-8'
        : 'application/xml; charset=utf-8'
  const body =
    kind === 'html'
      ? '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>503 Service Unavailable</title></head><body><h1>Service Unavailable</h1><p>The blog could not be loaded right now. Please try again in a moment.</p></body></html>'
      : 'Service Unavailable'
  return new Response(body, {
    status: 503,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
  })
}
