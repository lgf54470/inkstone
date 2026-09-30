import { getApiBase, getBlogOwner } from './api'

/**
 * 文章页由读者自己的浏览器上报一次浏览。
 *
 * 服务端取数的那次请求不带用户代理与来源（前台刻意不转发客户端可控的请求头），
 * 于是它记下的每一行都被判成爬虫、计数永不增长——统计页面因此长期读到 0 PV。
 * 这里是唯一同时握着真实用户代理与 document.referrer 的地方；服务端只信任请求本身
 * （边缘地址、UA），请求体里只有文章与来源。
 *
 * sendBeacon 优先：页面随时可能离开，浏览器会替它把请求发完；不可用时退化为 keepalive fetch。
 * 两者都会触发一次预检，公开 API 的 CORS 已经允许 POST 与 Content-Type。
 */
export function reportPostVisit(slug: string): void {
  if (!slug) return

  const owner = getBlogOwner()
  const query = owner ? `?owner=${encodeURIComponent(owner)}` : ''
  const url = `${getApiBase()}/api/blog/public/visits${query}`
  const payload = JSON.stringify({ slug, referrer: document.referrer || undefined })

  const beacon = new Blob([payload], { type: 'application/json' })
  if (navigator.sendBeacon?.(url, beacon)) return

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // 计数失败不影响阅读：页面已经渲染完了，这里没有可展示给读者的状态。
  })
}
