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
  const defaultOrigin = new URL(DEFAULT_API_URL).origin
  const origins = Array.from(new Set([apiOrigin, defaultOrigin])).join(' ')
  return [
    "default-src 'self'",
    `connect-src 'self' ${origins}`,
    `img-src 'self' https: data: ${origins}`,
    // 悬浮播放器直接从 API 源取音频：media-src 必须单独放行该来源
    `media-src 'self' ${origins}`,
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

// —— 天气数据同源代理 ——
// 浏览器端直接请求 Open-Meteo 会被 CSP connect-src 拦下（只放行 self 与 API 源），
// 统一走同源代理：参数白名单校验后转发，响应带 Cache-Control 让 CDN 边缘缓存公共数据。
const WEATHER_API_PREFIX = '/api/weather/'
const WEATHER_UPSTREAM_TIMEOUT_MS = 8000
const WEATHER_GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const WEATHER_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

function weatherJson(data: unknown, status: number, cacheControl: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
    },
  })
}

// 上游失败返回 502 与固定错误体（不透传上游细节）；超时由 AbortSignal.timeout 兜底
async function fetchWeatherUpstream(upstream: URL, cacheControl: string): Promise<Response> {
  try {
    const res = await fetch(upstream, { signal: AbortSignal.timeout(WEATHER_UPSTREAM_TIMEOUT_MS) })
    const text = await res.text()
    return new Response(text, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': cacheControl,
      },
    })
  } catch (err) {
    console.warn('[weather] upstream request failed:', err)
    return weatherJson({ error: 'upstream_unavailable' }, 502, 'no-store')
  }
}

// 只按固定模板拼上游 URL，不透传任意路径/主机，避免变成开放代理
function handleWeatherProxy(url: URL): Promise<Response> | Response {
  const { pathname, searchParams } = url
  if (pathname === '/api/weather/geocode') {
    const name = (searchParams.get('q') ?? '').trim().slice(0, 64)
    if (!name) return weatherJson({ error: 'missing_query' }, 400, 'no-store')
    const upstream = new URL(WEATHER_GEOCODE_URL)
    upstream.searchParams.set('name', name)
    upstream.searchParams.set('count', '6')
    upstream.searchParams.set('language', searchParams.get('language') === 'en' ? 'en' : 'zh')
    upstream.searchParams.set('format', 'json')
    return fetchWeatherUpstream(upstream, 'public, max-age=86400')
  }
  if (pathname === '/api/weather/forecast') {
    const lat = Number(searchParams.get('lat'))
    const lon = Number(searchParams.get('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return weatherJson({ error: 'invalid_coordinates' }, 400, 'no-store')
    }
    const upstream = new URL(WEATHER_FORECAST_URL)
    upstream.searchParams.set('latitude', String(lat))
    upstream.searchParams.set('longitude', String(lon))
    upstream.searchParams.set('current', 'temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m')
    upstream.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min')
    upstream.searchParams.set('timezone', 'auto')
    upstream.searchParams.set('forecast_days', '3')
    return fetchWeatherUpstream(upstream, 'public, max-age=300')
  }
  return weatherJson({ error: 'not_found' }, 404, 'no-store')
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.url.pathname.startsWith(WEATHER_API_PREFIX)) {
    return applyCsp(await handleWeatherProxy(context.url))
  }

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