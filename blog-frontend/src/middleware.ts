import { defineMiddleware } from 'astro:middleware'
import { getApiBase } from './lib/api'
import { DEFAULT_API_URL } from './lib/constants'
import { LOCALE_COOKIE_NAME, isSupportedLocale, resolveLocale } from './lib/i18n'

// 只信任本部署的 API 来源与自身资源；页面内联脚本（主题脚本与岛水合引导）逐响应
// 注入 nonce 放行，不再使用 'unsafe-inline'——即使未来出现注入点，攻击者也无法
// 预知 nonce，内联脚本不会被执行；外部脚本源（笔记内注入的 <script src="https://...">）
// 继续被 script-src 'self' 阻断。
function buildCsp(apiOrigin: string, nonce?: string): string {
  const scriptSrc = nonce ? `'self' 'nonce-${nonce}'` : "'self'"
  return [
    "default-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "img-src 'self' https: data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc}`,
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

// CSP nonce 需要随响应唯一且不可预测；base64url 满足 nonce 字符集要求。
function randomNonce(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
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

/**
 * 开发模式交给 vite HMR（ws 连接），生产响应才下发 CSP。
 * 带 src 的外部脚本无需 nonce（'self' 已放行）；Astro 岛水合脚本以
 * <script type="module"> 内联输出，逐个打上当前响应专属 nonce。
 */
function applyCsp(response: Response): Response {
  if (!import.meta.env.PROD) return response
  const contentType = response.headers.get('content-type') ?? ''
  let final = response
  if (contentType.includes('text/html')) {
    const nonce = randomNonce()
    final = new HTMLRewriter()
      .on('script', {
        element(element) {
          if (!element.hasAttribute('src') && !element.hasAttribute('nonce')) {
            element.setAttribute('nonce', nonce)
          }
        },
      })
      .transform(new Response(response.body, response))
    final.headers.set('Content-Security-Policy', buildCsp(apiOriginOf(), nonce))
  } else {
    final.headers.set('Content-Security-Policy', buildCsp(apiOriginOf()))
  }
  final.headers.set('X-Content-Type-Options', 'nosniff')
  return final
}

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

  let final = applyCsp(await next())

  const contentType = final.headers.get('content-type') ?? ''
  if (contentType.includes('text/html')) {
    const hasLocaleCookie = Boolean(cookieLang)
    const cacheControl = pageCacheControl(context.url, hasLocaleCookie)
    if (cacheControl) {
      final.headers.set('Cache-Control', cacheControl)
      final.headers.set('Vary', 'Accept-Language')
    }
  } else if (context.url.pathname === '/sitemap.xml') {
    final.headers.set('Cache-Control', 'public, max-age=3600')
  }
  return final
})