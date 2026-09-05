import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SHOWCASE_CONTENT } from '../src/data/showcase'
import { renderMarkdown } from '../src/lib/markdown'

const FIXTURES: Record<string, string> = {
  showcase: SHOWCASE_CONTENT,
  frontmatter: '---\ntitle: T\n---\n# Hello\n\nbody',
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
  details: '::: details open 标题\n内容\n:::',
  wikilink: '[[笔记|别名]] 与 [[纯链接]]',
  blockRef: '段落 ^anchor-id\n\n((anchor-id))',
  tag: '前置 #技术/前端 后置',
  embed: '![[嵌入笔记]]',
  ruby: '{汉字|hàn zì} 与 [注音]{zhù yīn}',
  table: '| a | b |\n| :--- | ---: |\n| 1 | 2 |',
  toc: '[TOC]\n\n# 标题一\n\n## 子标题',
  footnote: '引用[^1]\n\n[^1]: 注释内容',
  obsidianComment: '正文 %%隐藏%% 保留',
}

function hashMarkdown(md: string): string {
  const { html } = renderMarkdown(md)
  return createHash('sha256').update(html).digest('hex').slice(0, 20)
}

describe('markdown render baseline', () => {
  it('rendered HTML hashes are stable', () => {
    const hashes = Object.fromEntries(
      Object.entries(FIXTURES).map(([name, md]) => [name, hashMarkdown(md)])
    )
    expect(hashes).toMatchSnapshot()
  })
})