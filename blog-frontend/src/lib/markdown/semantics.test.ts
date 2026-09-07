import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './index'
import { calloutDefaultTitle } from './callout'

function render(md: string): string {
  return renderMarkdown(md).html
}

describe('callouts', () => {
  it('renders a non-folded callout as aside with normalized type and title', () => {
    const html = render('> [!NOTE] 提示\n> 内容一\n> 内容二')
    expect(html).toContain('<aside class="callout callout-note" data-callout="note"><div class="callout-title">提示</div><div class="callout-content">')
    expect(html).toContain('内容一')
    expect(html).toContain('内容二')
  })

  it('maps type aliases (hint -> tip) and falls back to default titles', () => {
    const html = render('> [!hint]\n> 内容')
    expect(html).toContain('class="callout callout-tip"')
    expect(html).toContain(calloutDefaultTitle('tip'))
  })

  it('renders folded callouts as details with open state controlled by +/-', () => {
    expect(render('> [!TIP]- 折叠\n> 内容')).toContain('<details class="callout callout-tip" data-callout="tip"><summary class="callout-title">折叠</summary>')
    expect(render('> [!TIP]- 折叠\n> 内容')).not.toContain('<details class="callout callout-tip" data-callout="tip" open>')
    expect(render('> [!TIP]+ 展开\n> 内容')).toContain('<details class="callout callout-tip" data-callout="tip" open>')
  })

  it('escapes the title and keeps content outside the title', () => {
    const html = render('> [!WARNING] <b>危险</b>\n> 正文')
    expect(html).toContain('&lt;b&gt;危险&lt;/b&gt;')
    expect(html).not.toContain('<b>危险</b>')
    expect(html).toContain('正文')
  })
})

describe('task lists', () => {
  it('marks done items with checked box, done class and data status', () => {
    const html = render('- [x] 已完成')
    expect(html).toContain('class="task-list-item enabled task-status-done done"')
    expect(html).toContain('<li class="task-list-item enabled task-status-done done" data-task-status="done">')
    expect(html).toContain('<input type="checkbox" class="task-list-item-checkbox" checked data-task-status="done" />')
    expect(html).toContain('<span class="task-label"> 已完成</span>')
  })

  it('maps extended markers to their status classes', () => {
    expect(render('- [ ] 待办')).toContain('task-status-todo')
    expect(render('- [/] 进行中')).toContain('task-status-in-progress')
    expect(render('- [-] 取消')).toContain('task-status-cancelled cancelled')
    expect(render('- [?] 疑问')).toContain('task-status-question')
    expect(render('- [!] 重要')).toContain('task-status-important')
  })
})

describe('tabs container', () => {
  it('marks the active tab and hides inactive panels', () => {
    const html = render('::: tabs\n@tab 甲\n内容A\n@tab:active 乙\n内容B\n:::')
    expect(html).toContain('role="tab" aria-selected="false" data-tab-button="0"')
    expect(html).toContain('role="tab" aria-selected="true" data-tab-button="1"')
    expect(html).toContain('<section class="tab-panel" role="tabpanel" data-tab-panel="0" hidden>')
    expect(html).toContain('<section class="tab-panel" role="tabpanel" data-tab-panel="1">')
    expect(html).toContain('内容A')
    expect(html).toContain('内容B')
  })

  it('renders directive tabs with ::: tab-item syntax', () => {
    const md = ':::: tabs\n::: tab-item 第一个标签\n这是第一个标签页的内容。\n:::\n::: tab-item 第二个标签\n这是第二个标签页的内容。\n:::\n::::'
    const html = render(md)
    expect(html).toContain('role="tab" aria-selected="true" data-tab-button="0"')
    expect(html).toContain('第一个标签')
    expect(html).toContain('role="tab" aria-selected="false" data-tab-button="1"')
    expect(html).toContain('第二个标签')
    expect(html).toContain('这是第一个标签页的内容。')
    expect(html).toContain('这是第二个标签页的内容。')
    expect(html).toContain('<section class="tab-panel" role="tabpanel" data-tab-panel="0">')
    expect(html).toContain('<section class="tab-panel" role="tabpanel" data-tab-panel="1" hidden>')
  })

  it('supports :selected: option in directive tabs', () => {
    const md = ':::: tabs\n::: tab-item 标签一\n内容一\n:::\n::: tab-item 标签二\n:selected:\n内容二\n:::\n::::'
    const html = render(md)
    expect(html).toContain('role="tab" aria-selected="false" data-tab-button="0"')
    expect(html).toContain('role="tab" aria-selected="true" data-tab-button="1"')
    expect(html).toContain('<section class="tab-panel" role="tabpanel" data-tab-panel="0" hidden>')
    expect(html).toContain('<section class="tab-panel" role="tabpanel" data-tab-panel="1">')
  })
})

describe('details container', () => {
  it('adds the open attribute only when requested', () => {
    expect(render('::: details open 标题\n内容\n:::')).toContain('<details class="markdown-details" open><summary>标题</summary>')
    expect(render('::: details 标题\n内容\n:::')).toContain('<details class="markdown-details"><summary>标题</summary>')
  })
})

describe('wikilinks and block references', () => {
  it('renders a wikilink with slugified href and escaped alias', () => {
    const html = render('[[系统架构|查看文档]]')
    expect(html).toContain('<a class="wikilink" data-wikilink="系统架构|查看文档" href="#系统架构">查看文档</a>')
  })

  it('escapes markup in wikilink aliases and targets', () => {
    const html = render('[[笔记|<script>alert(1)</script>]]')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
  })

  it('renders block references with anchored href', () => {
    const html = render('((abc-123))')
    expect(html).toContain('<a class="block-reference" data-block-ref="abc-123" href="#%5Eabc-123">((abc-123))</a>')
  })
})

describe('inline tags', () => {
  it('links boundary-preceded tags to the tag page', () => {
    const html = render('前置 #技术/前端 后置')
    expect(html).toContain('<a href="/tags/%E6%8A%80%E6%9C%AF%2F%E5%89%8D%E7%AB%AF" class="inline-tag" data-tag="技术/前端">#技术/前端</a>')
  })

  it('does not link tags glued to word characters', () => {
    const html = render('abc#tag 与 123#456')
    expect(html).not.toContain('inline-tag')
  })
})

describe('math', () => {
  it('renders inline math through KaTeX', () => {
    const html = render('行内 $E=mc^2$ 公式')
    expect(html).toContain('katex')
    expect(html).not.toContain('$E=mc^2$')
  })

  it('renders block math inside a math-block wrapper', () => {
    const html = render('$$\nx = 1\n$$')
    expect(html).toContain('<div class="math-block">')
    expect(html).toContain('katex-display')
  })
})

describe('obsidian comments and raw html', () => {
  it('strips %% comments from output', () => {
    const html = render('正文 %%隐藏%% 保留')
    expect(html).not.toContain('隐藏')
    expect(html).toContain('正文')
    expect(html).toContain('保留')
  })

  it('keeps author-authored raw html like kbd', () => {
    const html = render('按 <kbd>Ctrl</kbd> 保存')
    expect(html).toContain('<kbd>Ctrl</kbd>')
  })
})

describe('toc', () => {
  it('collects heading levels with anchor links in order', () => {
    const html = render('[TOC]\n\n# 标题一\n\n## 子标题')
    expect(html).toContain('<nav class="table-of-contents"><div class="toc-title">目录</div><ul class="toc-list">')
    expect(html).toContain('<li class="toc-item toc-level-1"><a href="#标题一" class="toc-link">标题一</a></li>')
    expect(html).toContain('<li class="toc-item toc-level-2"><a href="#子标题" class="toc-link">子标题</a></li>')
  })

  it('renders an empty toc state when no headings exist', () => {
    const html = render('[TOC]\n\n正文')
    expect(html).toContain('class="table-of-contents empty"')
  })
})

describe('tables', () => {
  it('wraps tables and converts alignment styles to align attributes', () => {
    const html = render('| a | b | c |\n| :--- | ---: | :---: |\n| 1 | 2 | 3 |')
    expect(html).toContain('<div class="table-wrap"><table>')
    // 内联 style 在净化时剥离（镜像主应用 PROSE 规则），对齐改由 align 属性承载
    expect(html).not.toContain('style=')
    expect(html).toContain('<th align="left">a</th>')
    expect(html).toContain('<th align="right">b</th>')
    expect(html).toContain('<th align="center">c</th>')
  })
})

describe('code fences', () => {
  it('renders a standard fence with title, language and highlight lines', () => {
    const html = render('```ts title="demo.ts" {2,4-5}\nconst a = 1\nconst b = 2\n```')
    expect(html).toContain('<div class="code-block" data-lang="ts" data-code-start="1" data-highlight-lines="2,4,5">')
    expect(html).toContain('<span class="code-title">demo.ts</span>')
    expect(html).toContain('<span class="code-lang">ts</span>')
    expect(html).toContain('<code class="language-ts">')
    expect(html).toContain('class="line highlighted"')
  })

  it('escapes the title and code content', () => {
    const html = render('```js title="a<b>&c"\nif (x < y) {}\n```')
    expect(html).toContain('a&lt;b&gt;&amp;c')
    expect(html).not.toContain('a<b>&c')
    expect(html).not.toContain('if (x < y)')
  })

  it('renders mermaid fences as lazy-loading placeholders', () => {
    const html = render('```mermaid\nflowchart TD\nA-->B\n```')
    expect(html).toContain('class="mermaid-block loading"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('data-mermaid="flowchart%20TD')
  })

  it('renders chart fences as lazy-loading placeholders', () => {
    const html = render('```chart\n{"type":"bar"}\n```')
    expect(html).toContain('class="chartjs-block loading"')
    expect(html).toContain('data-chart=')
  })
})

describe('reusable renderer', () => {
  it('produces identical output across repeated calls', () => {
    const first = renderMarkdown('## 标题\n\n正文')
    const second = renderMarkdown('## 标题\n\n正文')
    expect(second.html).toBe(first.html)
    expect(second.headings).toEqual(first.headings)
  })

  it('does not leak headings between renders', () => {
    const withHeadings = renderMarkdown('## 甲\n\n正文')
    expect(withHeadings.headings).toHaveLength(1)
    const without = renderMarkdown('无标题正文')
    expect(without.headings).toEqual([])
    const again = renderMarkdown('## 乙')
    expect(again.headings).toHaveLength(1)
    expect(again.headings[0]!.text).toBe('乙')
  })

  it('does not leak nested preview headings into the outer toc', () => {
    const result = renderMarkdown('# 外层\n\n~~~md-example\n## 内层标题\n~~~')
    expect(result.headings.map((h) => h.text)).toEqual(['外层'])
  })
})

describe('md-example recursion depth guard', () => {
  it('renders nested md-example up to the depth limit', () => {
    const nested = '~~~md-example\n**粗体**\n~~~'
    const html = renderMarkdown(nested).html
    expect(html).toContain('<strong>粗体</strong>')
    expect(html).toContain('markdown-example-preview')
  })

  it('degrades to a plain code block instead of recursing beyond the limit', () => {
    // 5 层嵌套超过 MAX_MD_EXAMPLE_DEPTH=4：若没有深度护栏会无限递归直至栈溢出
    let nested = '**最内层**'
    for (let i = 0; i < 5; i++) {
      nested = `~~~md-example\n${nested}\n~~~`
    }
    const html = renderMarkdown(nested).html
    expect(html).toContain('最内层')
    // 前 4 层各产出预览区，超限层改以普通代码块展示源码（code-lang 仅守卫降级块产出）
    expect(html.match(/class="markdown-example-preview"/g)).toHaveLength(4)
    expect(html).toContain('<span class="code-lang">markdown</span>')
  })
})

describe('misc extensions', () => {
  it('renders footnotes with ref and backref', () => {
    const html = render('引用[^1]\n\n[^1]: 注释内容')
    expect(html).toContain('footnote-ref')
    expect(html).toContain('footnote-backref')
    expect(html).toContain('注释内容')
  })

  it('renders ruby annotations', () => {
    const html = render('[注音]{zhù yīn}')
    expect(html).toContain('<ruby>注音<rp>(</rp><rt>zhù yīn</rt><rp>)</rp></ruby>')
  })

  it('expands emoji shortcodes', () => {
    const html = render(':smile:')
    expect(html).not.toContain(':smile:')
  })

  it('adds heading anchors with ids', () => {
    const html = render('# 一级标题')
    expect(html).toContain('<h1 id="一级标题" tabindex="-1"><a class="heading-anchor" href="#一级标题" aria-hidden="true"></a>')
  })
})