/**
 * javascript-example 输出面板的隔离 iframe 文档。
 *
 * 为什么输出放在 iframe 里：日志文本来自文章代码（不可信），渲染侧即使出现
 * 未来回归（如改用 innerHTML）也被限制在这个 sandbox="allow-scripts"、
 * 无 allow-same-origin 的不透明源文档内——它拿不到父页面 DOM、Cookie 与
 * localStorage，也没有任何顶层导航/弹窗能力。
 *
 * 样式说明：不透明源读不到父页面 CSS 变量，主题色由父页面在创建时读取设计
 * 令牌（getComputedStyle）后随 srcdoc 注入，颜色来源仍是令牌而非硬编码。
 *
 * 行内容只经 textContent 写入；行 className 由父页面传入的 kind 拼接，
 * kind 来自 runner 自身（log/info/warn/error/return/empty），不含用户数据。
 */
export interface JsExampleFrameTheme {
  fontMono: string
  textPrimary: string
  textTertiary: string
  textQuaternary: string
  accent: string
  warning: string
  danger: string
  success: string
  syntaxConstant: string
  borderSubtle: string
}

const FRAME_SCRIPT = `
(function () {
  var output = document.getElementById('output')
  window.addEventListener('message', function (event) {
    var rows = event.data && event.data.rows
    if (!Array.isArray(rows)) return
    output.textContent = ''
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i]
      var div = document.createElement('div')
      div.className = 'row is-' + row.kind
      var prefix = document.createElement('span')
      prefix.className = 'prefix'
      prefix.textContent = row.prefix
      var text = document.createElement('span')
      text.className = 'text'
      text.textContent = row.text
      div.appendChild(prefix)
      div.appendChild(text)
      output.appendChild(div)
    }
  })
})()
`.trim()

export function buildFrameSrcdoc(theme: JsExampleFrameTheme): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8"><style>',
    ':root{',
    `--font-mono:${theme.fontMono};`,
    `--text-primary:${theme.textPrimary};`,
    `--text-tertiary:${theme.textTertiary};`,
    `--text-quaternary:${theme.textQuaternary};`,
    `--accent:${theme.accent};`,
    `--warning:${theme.warning};`,
    `--danger:${theme.danger};`,
    `--success:${theme.success};`,
    `--syntax-constant:${theme.syntaxConstant};`,
    `--border-subtle:${theme.borderSubtle};`,
    '}',
    'body{margin:0;padding:0;background:transparent;font-family:var(--font-mono);font-size:12px;line-height:1.5;color:var(--text-primary)}',
    '#output{overflow-y:auto;max-height:100%}',
    '.row{display:flex;align-items:baseline;gap:0.45em;padding:2px 0;border-bottom:1px solid color-mix(in oklab, var(--border-subtle) 40%, transparent)}',
    '.row:last-child{border-bottom:none}',
    '.prefix{font-size:10px;font-weight:700;flex:none;opacity:0.7;color:var(--text-tertiary)}',
    '.text{white-space:pre-wrap;word-break:break-all}',
    '.row.is-info .prefix,.row.is-info .text{color:var(--accent)}',
    '.row.is-warn .prefix,.row.is-warn .text{color:var(--warning)}',
    '.row.is-error .prefix,.row.is-error .text{color:var(--danger)}',
    '.row.is-return .text{color:var(--syntax-constant, var(--accent));font-weight:600}',
    '.row.is-empty{color:var(--text-quaternary);font-style:italic}',
    '</style></head><body><div id="output"></div>',
    `<script>${FRAME_SCRIPT}<\/script>`,
    '</body></html>',
  ].join('')
}