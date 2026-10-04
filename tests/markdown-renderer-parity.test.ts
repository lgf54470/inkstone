import { describe, expect, it } from 'vitest'
import { renderMarkdown as renderRoot } from '../src/client/lib/markdown/renderer'
import { renderMarkdown as renderBlog } from '../blog-frontend/src/lib/markdown'
import { SHOWCASE_CONTENT } from '../blog-frontend/src/data/showcase'

const FIXTURES: Record<string, string> = {
  showcase: SHOWCASE_CONTENT,
  callout: '> [!NOTE] 提示\n> 内容一\n> 内容二',
  calloutFold: '> [!TIP]- 折叠\n> 内容',
  tasks: '- [ ] 待办\n- [x] 已完成\n- [/] 进行中\n- [!] 重要',
  mathInline: '行内 $E=mc^2$ 公式',
  mathBlock: '$$\n\\int_0^1 x dx\n$$',
  fence: '```ts title="demo.ts" {2,4-5}\nconst a = 1\nconst b = 2\n```',
  mermaid: '```mermaid\nflowchart TD\nA-->B\n```',
  chart: '```chart\n{"type":"bar","data":{"labels":["a"],"datasets":[{"data":[1]}]}}\n```',
  mdExample: '~~~md-example title="对比"\n**粗体**\n~~~',
  jsExample: '~~~javascript-example title="运行"\nconst x = 1\n~~~',
  tabs: '::: tabs\n@tab 甲\n内容A\n@tab:active 乙\n内容B\n:::',
  tabsDirective: ':::: tabs\n::: tab-item 甲\n内容A\n:::\n::: tab-item 乙\n内容B\n:::\n::::',
  details: '::: details open 标题\n内容\n:::',
  wikilink: '[[笔记|别名]] 与 [[纯链接]]',
  blockRef: '段落 ^anchor-id\n\n((anchor-id))',
  tag: '前置 #技术/前端 后置',
  embed: '![[嵌入笔记]]',
  ruby: '{汉字|hàn zì} 与 [注音]{zhù yīn}',
  table: '| a | b |\n| :--- | ---: |\n| 1 | 2 |',
  // A bare table whose first cell names a chart: both trees must emit the same marker in the same
  // place and empty the same cell, or a post renders a chart in one tree and a stray `:bar:` in the
  // other. The configuration rides differently (base64 in the app, percent-encoded here), which the
  // skeleton comparison ignores by design — it is the shape that has to agree.
  tableChart: '| :bar:{"title": "T"} | A | B |\n| --- | --- | --- |\n| s | 1 | 2 |',
  toc: '[TOC]\n\n# 标题一\n\n## 子标题',
  footnote: '引用[^1]\n\n[^1]: 注释内容',
  obsidianComment: '正文 %%隐藏%% 保留',
  // The `:::` panel family: alignment, columns, tabs written with `::`, the timeline, and a callout
  // fence that must reach the same markup as the blockquote spelling above.
  panelAlign: '::: center\n正文内容\n:::',
  panelCols: '::: cols 1fr 2fr gap=wide divider center\n一\n::\n二\n:::',
  panelTabsColon: '::: tabs\n:: 甲\n内容A\n:: 乙\n内容B\n:::',
  panelTabsT: '::: t pills\n:: 甲\nA\n:::',
  panelTimeline: '::: timeline\n:: [done] 2024-01-15 发布\n细节\n:: [milestone] v1.0 里程碑\n:::',
  panelTimelineTitle: ':::timeline 发展历程\n:: [done] 2024-01-15 发布\n:::',
  panelTimelineBreaks: '::: timeline\n:: [done] 发布\n第一行\n第二行\n- 列表甲\n- 列表乙\n:::',
  panelNoSpace: ':::cols\n一\n::\n二\n:::\n\n:::center\n正文\n:::\n\n:::tip 标题\n内容\n:::',
  panelCallout: '::: tip 标题\n内容\n:::',
  panelCalloutFold: '::: warning- 折叠\n内容\n:::',
  panelUnclaimed: '::: whatever\n正文\n:::',
  // `::` marks must stay inert inside a code fence and inside a nested `:::` container, so this
  // fixture proves the line walker on both trees at once — and inherits the fence divergence below.
  panelColsFence: '::: cols\n一\n::\n```\na :: b\n::: not a close\n```\n:::',
  panelColsNested: '::: cols\n外\n::\n::: tabs\n:: 内\n面板\n:::\n:::',
}

// Structural parity baseline: root and blog renderers keep (and must not silently
// change) these tag/class skeleton differences. Any baseline item that converges
// or any unregistered divergence fails the test, forcing an explicit sync.
const KNOWN_DIVERGENCE: Record<string, string> = {
  // blog: Prism highlight at SSR (span.line/token); root: highlight deferred to the client.
  fence: 'ssr-prism-vs-client-highlight',
  // blog: clickable <a href=/tags/...>; root: <span role=link> handled by JS.
  tag: 'anchor-vs-role-link',
  // blog: static placeholder card (div inside p); root: loading card hydrated client-side.
  embed: 'static-card-vs-hydrated-loading-card',
  // blog: full KaTeX HTML at SSR; root: math-inline placeholder rendered client-side.
  mathInline: 'ssr-katex-vs-client-placeholder',
  // Same divergence as mathInline.
  mathBlock: 'ssr-katex-vs-client-placeholder',
  // blog: line-number switch wrapped in label.js-example-switch-wrap; root: bare button.
  jsExample: 'switch-wrap-label-difference',
  // Composed fixture: root renders a frontmatter properties card (blog strips it)
  // plus the fence/tag/embed/math differences above.
  showcase: 'frontmatter-card-plus-composed-diffs',
  // A `:::` cols block whose body holds a code fence: the panel skeleton matches, so the only
  // difference left is the one `fence` above already records.
  panelColsFence: 'ssr-prism-vs-client-highlight',
}

// Skeleton compares tag names and class tokens only (attribute order insensitive),
// ignoring text: the root renderer emits i18n key literals without a provider in
// tests, and both trees pin full output text via their own baseline snapshots.
function skeleton(html: string): string {
  const tags = html.replace(/<!--[\s\S]*?-->/g, '').match(/<([a-z0-9-]+)((?:\s+[a-z-]+(?:="[^"]*")?)*)\s*\/?>/g) ?? []
  return tags
    .map((tag) => {
      const match = /^<([a-z0-9-]+)((?:\s+[a-z-]+(?:="[^"]*")?)*)\s*\/?>$/.exec(tag)!
      const classes = (match[2]!.match(/class="([^"]*)"/) ?? [])[1]
        ?.split(/\s+/)
        .filter(Boolean)
        .sort()
        .join('.')
      return `<${match[1]}${classes ? `:${classes}` : ''}>`
    })
    .join('\n')
}

describe('markdown renderer cross-tree parity', () => {
  it('keeps root and blog renderers structurally in sync', () => {
    const unexpected: string[] = []
    const converged: string[] = []
    for (const [name, md] of Object.entries(FIXTURES)) {
      const root = skeleton(renderRoot(md).html)
      const blog = skeleton(renderBlog(md).html)
      const known = name in KNOWN_DIVERGENCE
      if (root === blog) {
        if (known) converged.push(name)
      } else if (!known) {
        unexpected.push(`\n=== ${name} ===\nROOT:\n${root}\nBLOG:\n${blog}`)
      }
    }
    expect(converged).toEqual([])
    expect(unexpected.join('\n')).toBe('')
  })
})