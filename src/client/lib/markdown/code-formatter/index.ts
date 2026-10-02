import { resolveCategory, type FormatterCategory } from './types'
import { formatCStyle } from './c-style'
import { formatMarkup } from './markup'
import { formatStyles } from './styles'
import { formatSql } from './sql'
import { formatJson, formatYaml, formatToml } from './data'
import { formatPython } from './python'
import { formatShell, formatLua, formatRuby, formatDockerfile, formatNginx } from './scripts'
import { formatMermaid, formatDiff, formatMarkdown, formatGeneric } from './diagrams'

function formatChartCode(code: string, tabSize: number): string {
  const trimmed = code.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return formatJson(trimmed, tabSize)
  }
  return formatCStyle(code, tabSize)
}

function formatOutlineOrJson(code: string, tabSize: number): string {
  const trimmed = code.trim()
  if (trimmed.startsWith('{')) {
    return formatJson(trimmed, tabSize)
  }
  return formatMarkdown(code)
}

const FORMATTERS: Record<FormatterCategory, (code: string, tabSize: number) => string> = {
  'c-style': (code, tab) => formatCStyle(code, tab),
  html: (code, tab) => formatMarkup(code.trim(), tab, true),
  xml: (code, tab) => formatMarkup(code.trim(), tab, false),
  css: (code, tab) => formatStyles(code, tab),
  sql: (code) => formatSql(code.trim()),
  json: (code, tab) => formatJson(code.trim(), tab),
  yaml: (code, tab) => formatYaml(code.trim(), tab),
  toml: (code) => formatToml(code),
  python: (code, tab) => formatPython(code, tab),
  shell: (code, tab) => formatShell(code, tab),
  lua: (code, tab) => formatLua(code, tab),
  ruby: (code, tab) => formatRuby(code, tab),
  dockerfile: (code) => formatDockerfile(code),
  nginx: (code, tab) => formatNginx(code, tab),
  mermaid: (code, tab) => formatMermaid(code, tab),
  diff: (code) => formatDiff(code),
  markdown: (code) => formatMarkdown(code),
  slides: (code) => formatMarkdown(code),
  chart: formatChartCode,
  mindmap: formatOutlineOrJson,
  kanban: formatOutlineOrJson,
  excalidraw: (code, tab) => formatJson(code.trim(), tab),
  generic: (code) => formatGeneric(code),
}

export function formatCode(code: string, language: string, tabSize = 2): string {
  const trimmed = code.trim()
  if (!trimmed) return code

  const category = resolveCategory(language)
  const fn = FORMATTERS[category] ?? formatGeneric
  return fn(code, tabSize)
}
