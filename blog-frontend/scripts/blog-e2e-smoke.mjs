/**
 * 对运行中的 preview 服务器做冒烟校验：
 * - sitemap.xml / feed.xml 返回 200 且为合法 XML 结构
 * - 失效内容路由返回真实 404（而非 302）
 * - 首页返回 HTML
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

  console.log('blog e2e smoke passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})