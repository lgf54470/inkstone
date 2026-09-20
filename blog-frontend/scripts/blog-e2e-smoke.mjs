/**
 * 对运行中的 preview 服务器做冒烟校验：
 * - sitemap.xml / feed.xml 返回 200 且为合法 XML 结构
 * - 失效内容路由返回真实 404（而非 302）
 * - 首页返回 HTML
 * - 生产响应下发 CSP，且每个内联脚本都带上当前响应的 nonce
 * 供 CI 使用（先 --ping 探活，再执行校验）。
 */
const BASE_URLS = ['http://127.0.0.1:4321', 'http://[::1]:4321', 'http://localhost:4321']

async function probe(path) {
  for (const base of BASE_URLS) {
    try {
      const res = await fetch(base + path)
      if (res.status !== 0) return res
    } catch {
      // 尝试下一个地址（preview 可能只绑定 IPv4 或 IPv6）
    }
  }
  return null
}

const isPing = process.argv.includes('--ping')

const SCRIPT_TAG = /<script\b[^>]*>/gi
const NONCE_ATTRIBUTE = /\snonce="([^"]*)"/i
const SRC_ATTRIBUTE = /\ssrc\s*=/i

function fail(message) {
  console.error(`FAIL ${message}`)
  process.exit(1)
}

/**
 * 中间件在真实响应上调用 workerd 的 HTMLRewriter（middleware.ts 的 applyCsp，声明见
 * src/types/shims.d.ts）：内联脚本逐个打上当前响应专属 nonce，带 src 的外链脚本跳过。
 * 断言跑在 workerd 里执行的那份中间件上，所以 on/hasAttribute/setAttribute/transform
 * 一旦与声明不符（少了成员、返回类型不对），内联脚本就会缺 nonce 或 nonce 对不上，
 * 这里立刻失败——类型声明本身无法证明运行时行为，这段检查才是那份声明的凭据。
 */
async function checkCspNonce() {
  const response = await probe('/')
  if (!response) fail('CSP: no response from /')

  const policy = response.headers.get('content-security-policy')
  if (!policy) {
    fail('CSP: / served without Content-Security-Policy (this check needs the production preview, dev mode skips it)')
  }
  const responseNonce = policy.match(/'nonce-([^']+)'/)?.[1]
  if (!responseNonce) fail(`CSP: script-src carries no nonce: ${policy}`)

  const html = await response.text()
  const scripts = [...html.matchAll(SCRIPT_TAG)].map((match) => match[0])
  if (scripts.length === 0) fail('CSP: / rendered no script tag, the nonce rewrite went untested')

  let inline = 0
  let external = 0
  for (const tag of scripts) {
    const nonce = tag.match(NONCE_ATTRIBUTE)?.[1] ?? null
    if (SRC_ATTRIBUTE.test(tag)) {
      external += 1
      if (nonce) fail(`CSP: external script must not carry a nonce: ${tag}`)
      continue
    }
    inline += 1
    if (nonce !== responseNonce) {
      fail(`CSP: inline script nonce ${nonce === null ? 'missing' : `"${nonce}"`} does not match the response nonce`)
    }
  }
  if (inline === 0) fail('CSP: / rendered no inline script, the nonce rewrite went untested')
  if (external === 0) console.log('note: / rendered no external script, the src-skip branch was not exercised here')

  const second = await probe('/')
  if (!second) fail('CSP: no response on the second request to /')
  const secondNonce = second.headers.get('content-security-policy')?.match(/'nonce-([^']+)'/)?.[1]
  if (!secondNonce) fail('CSP: script-src carries no nonce on the second response')
  if (secondNonce === responseNonce) fail(`CSP: nonce reused across responses: ${responseNonce}`)
}

async function main() {
  const home = await probe('/')
  if (!home) {
    console.error('FAIL: preview server not reachable')
    process.exit(1)
  }
  if (isPing) process.exit(0)

  const checks = [
    ['/sitemap.xml', 200, ['<urlset', '<loc>']],
    ['/feed.xml', 200, ['<rss', '<channel', '<item>']],
    ['/posts/__smoke-nonexistent__', 404, []],
    ['/categories/__smoke-nonexistent__', 404, []],
    ['/', 200, ['<html']],
  ]

  for (const [path, expectedStatus, needles] of checks) {
    const res = await probe(path)
    if (!res) {
      console.error(`FAIL ${path}: no response`)
      process.exit(1)
    }
    if (res.status !== expectedStatus) {
      console.error(`FAIL ${path}: expected ${expectedStatus}, got ${res.status}`)
      process.exit(1)
    }
    const text = await res.text()
    for (const needle of needles) {
      if (!text.includes(needle)) {
        console.error(`FAIL ${path}: missing "${needle}" in body`)
        process.exit(1)
      }
    }
  }

  await checkCspNonce()

  console.log('blog e2e smoke passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
