import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './index'
import { sanitizeProseHtml } from './sanitize'

const XSS_CASES: Array<{ name: string; payload: string }> = [
  { name: 'script tag', payload: '<script>alert(1)</script>' },
  { name: 'script with entity encoding', payload: '&lt;script&gt;alert(1)&lt;/script&gt;' },
  { name: 'img onerror', payload: '<img src=x onerror=alert(1)>' },
  { name: 'svg onload', payload: '<svg onload=alert(1)><circle r=10 /></svg>' },
  { name: 'event handler on allowed tag', payload: '<a href="/ok" onclick="alert(1)">x</a>' },
  { name: 'javascript href', payload: '<a href="javascript:alert(1)">x</a>' },
  { name: 'javascript href mixed case', payload: '<a href="JaVaScRiPt:alert(1)">x</a>' },
  { name: 'iframe', payload: '<iframe src="https://evil.example"></iframe>' },
  { name: 'iframe srcdoc', payload: '<iframe srcdoc="<script>alert(1)</script>"></iframe>' },
  { name: 'object embed', payload: '<object data="https://evil.example"></object>' },
  { name: 'style tag', payload: '<style>body{display:none}</style>' },
  { name: 'style attribute', payload: '<p style="background:url(https://evil.example/x)">x</p>' },
  { name: 'form', payload: '<form action="https://evil.example"><input name="pw"></form>' },
  { name: 'input not checkbox', payload: '<input type="text" name="pw">' },
  { name: 'meta refresh', payload: '<meta http-equiv="refresh" content="0;url=https://evil.example">' },
  { name: 'base hijack', payload: '<base href="https://evil.example/">' },
  { name: 'noscript', payload: '<noscript><img src=x onerror=alert(1)></noscript>' },
  { name: 'template', payload: '<template><img src=x onerror=alert(1)></template>' },
  { name: 'data uri script', payload: '<a href="data:text/html,<script>alert(1)</script>">x</a>' },
]

describe('sanitizeProseHtml stored-XSS defense', () => {
  it.each(XSS_CASES)('neutralizes $name', ({ payload }) => {
    const html = sanitizeProseHtml(`<p>before</p>${payload}<p>after</p>`)
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/onerror|onload|onclick/i)
    expect(html).not.toMatch(/javascript:/i)
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('<object')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('<base')
    expect(html).not.toContain('<meta')
    expect(html).not.toContain('style=')
    expect(html).toContain('<p>before</p>')
    expect(html).toContain('<p>after</p>')
  })

  it('is idempotent (safe for nested md-example double pass)', () => {
    const dirty = '<p onclick="x()"><b>粗</b><img src=x onerror=alert(1)></p><script>alert(1)</script>'
    const once = sanitizeProseHtml(dirty)
    expect(sanitizeProseHtml(once)).toBe(once)
  })

  it('drops the content of an unclosed math mXSS payload (rawtext swallowing)', () => {
    // 经典的 DOMPurify mXSS 载荷（未闭合的 <math>）。math 在 nonTextTags 中，
    // 其后所有内容按 rawtext 丢弃：攻击者的注入被整段吞掉，文章提前截断但无注入
    const html = sanitizeProseHtml(
      '<p>before</p><math><mtext><table><mglyph><style><!--</style><img title="--><img src=1 onerror=alert(1)>">'
    )
    expect(html).toContain('<p>before</p>')
    expect(html).not.toMatch(/<script|<img|onerror|<math/i)
  })

  it('drops the content of script/style/iframe/math instead of keeping text', () => {
    const html = sanitizeProseHtml('<script>alert(1)</script><style>body{}</style><iframe>click me</iframe><math><mi>x</mi></math>')
    expect(html).not.toContain('alert(1)')
    expect(html).not.toContain('click me')
    expect(html).not.toContain('<mi>')
  })
})

describe('sanitizeProseHtml whitelist behavior', () => {
  it('keeps the whitelisted blog features intact', () => {
    const html = sanitizeProseHtml(
      '<details open><summary>标题</summary>内容</details>' +
        '<section class="tab-panel" hidden>面板</section>' +
        '<input type="checkbox" class="task-list-item-checkbox" checked="" data-task-status="done" />' +
        '<a href="/tags/x" target="_blank">外链</a>' +
        '<img src="data:image/png;base64,AAAA" alt="内嵌">' +
        '<kbd>Ctrl</kbd> <ruby>注<rp>(</rp><rt>zhu</rt><rp>)</rp></ruby>' +
        '<div class="code-block" data-lang="ts" data-code-start="1" data-line-numbers="true"></div>' +
        '<label class="js-example-switch-wrap" title="显示行号">行号</label>'
    )
    expect(html).toContain('<details open><summary>标题</summary>内容</details>')
    expect(html).toContain('<section class="tab-panel" hidden>面板</section>')
    expect(html).toContain('<input type="checkbox" class="task-list-item-checkbox" checked data-task-status="done" />')
    expect(html).toContain('<a href="/tags/x" target="_blank" rel="noopener noreferrer">外链</a>')
    expect(html).toContain('<img src="data:image/png;base64,AAAA" alt="内嵌" loading="lazy" decoding="async" />')
    expect(html).toContain('<kbd>Ctrl</kbd>')
    expect(html).toContain('<rp>(</rp><rt>zhu</rt><rp>)</rp>')
    expect(html).toContain('data-lang="ts" data-code-start="1" data-line-numbers="true"')
    expect(html).toContain('<label class="js-example-switch-wrap" title="显示行号">行号</label>')
  })

  it('strips style attributes from prose but keeps KaTeX layout styles', () => {
    const prose = sanitizeProseHtml('<p style="color:red">x</p><th style="text-align:right" align="right">a</th>')
    expect(prose).not.toContain('style=')
    expect(prose).toContain('<th align="right">a</th>')

    // 平方根/分式才产出 svg，简单上下标只有 span
    const math = renderMarkdown('行内 $\\frac{1}{\\sqrt{2}}$ 公式').html
    expect(math).toContain('katex')
    expect(math).toContain('style="')
    expect(math).toContain('<svg')
    expect(math).toContain('<path d=')
    expect(math).not.toContain('<math')
  })
})

describe('renderMarkdown end-to-end sanitization', () => {
  it('sanitizes raw HTML written into a post body', () => {
    const { html } = renderMarkdown('正文 <script>alert(1)</script> 与 <img src=x onerror=alert(1)> 结尾')
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toContain('onerror')
    expect(html).toContain('正文')
    expect(html).toContain('结尾')
  })

  it('keeps the recursion-safe md-example preview sanitized', () => {
    const { html } = renderMarkdown('~~~md-example title="演示"\n**粗体** <script>alert(1)</script>\n~~~')
    expect(html).not.toMatch(/<script/i)
    expect(html).toContain('<strong>粗体</strong>')
  })
})