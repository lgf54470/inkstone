import { defineMiddleware } from 'astro:middleware'
import { getApiBase } from './lib/api'
import { DEFAULT_API_URL } from './lib/constants'
import { LOCALE_COOKIE_NAME, isSupportedLocale, resolveLocale } from './lib/i18n'

// 只信任本部署的 API 来源与自身资源；脚本/样式允许内联（主题脚本与岛水合引导），
// 但阻断任何外部脚本源（笔记内注入的 <script src="https://..."> 不再生效）。
function buildCsp(apiOrigin: string): string {
  return [
    "default-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "img-src 'self' https: data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

function apiOriginOf(): string {
  try {
    return new URL(getApiBase()).origin
  } catch {
    return new URL(DEFAULT_API_URL).origin
  }
}

/**
 * HTML 页面分级缓存：静态资产由 Cloudflare 按文件名 hash 长期缓存，
 * 此处只负责 SSR 页面。自定义语言用户（带 locale cookie）不缓存，
 * 避免 CDN 命中其他语言副本；其余页面按 Vary: Accept-Language 区分。
 */
function pageCacheControl(url: URL, hasLocaleCookie: boolean): string | null {
  if (hasLocaleCookie) return 'private, no-store'
  if (url.pathname.startsWith('/posts/')) return 'public, max-age=0, s-maxage=300'
  return 'public, max-age=0, s-maxage=60'
}

const CSP = buildCsp(apiOriginOf())

export const onRequest = defineMiddleware(async (context, next) => {
  const queryLang = context.url.searchParams.get('lang')
  const cookieLang = context.cookies.get(LOCALE_COOKIE_NAME)?.value || context.cookies.get('inkstone_locale')?.value
  const acceptLanguage = context.request.headers.get('accept-language')

  const locale = resolveLocale(cookieLang, acceptLanguage, queryLang)
  context.locals.locale = locale

  if (queryLang && isSupportedLocale(queryLang)) {
    context.cookies.set(LOCALE_COOKIE_NAME, queryLang, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    })
  }

  const response = await next()
  // 开发模式交给 vite HMR（ws 连接），生产响应才下发 CSP
  if (import.meta.env.PROD) {
    response.headers.set('Content-Security-Policy', CSP)
    response.headers.set('X-Content-Type-Options', 'nosniff')
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('text/html')) {
    const hasLocaleCookie = Boolean(cookieLang)
    const cacheControl = pageCacheControl(context.url, hasLocaleCookie)
    if (cacheControl) {
      response.headers.set('Cache-Control', cacheControl)
      response.headers.set('Vary', 'Accept-Language')
    }
  } else if (context.url.pathname === '/sitemap.xml') {
    response.headers.set('Cache-Control', 'public, max-age=3600')
  }
  return response
})