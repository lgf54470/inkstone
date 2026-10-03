import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './index'
import { parseFenceInfo } from './fence'

function render(md: string): string {
  return renderMarkdown(md).html
}

function fence(body: string, info: string): string {
  return `~~~${info}\n${body}\n~~~`
}

describe('standard code fence options', () => {
  it('emits wrap, collapse and theme attributes', () => {
    const html = render(fence('a\nb\nc', 'ts wrap collapse=12 theme=dark'))
    expect(html).toContain('data-code-wrap="true"')
    expect(html).toContain('data-code-collapse-at="12"')
    expect(html).toContain('data-code-theme="dark"')
  })

  it('reads nowrap and explicit light theme, and drops unknown theme values', () => {
    expect(parseFenceInfo('js nowrap theme=light').wrap).toBe(false)
    expect(parseFenceInfo('js nowrap theme=light').theme).toBe('light')
    expect(parseFenceInfo('js theme=purple').theme).toBe('auto')
    expect(parseFenceInfo('js collapse=0').collapse).toBe(0)
    expect(parseFenceInfo('js collapse=abc').collapse).toBeNull()
  })

  it('reads named hl_lines/highlight specs in both brace and trailing spellings', () => {
    expect(parseFenceInfo('python {.python hl_lines="2,4"}').highlightedLines).toEqual([2, 4])
    expect(parseFenceInfo('python highlight="1,3-4"').highlightedLines).toEqual([1, 3, 4])
  })

  it('still supports title, line numbers, start and brace highlight groups', () => {
    const info = parseFenceInfo('ts title="a.ts" line-numbers start=10 {2,4-5}')
    expect(info).toMatchObject({ title: 'a.ts', lineNumbers: true, startLine: 10 })
    expect(info.highlightedLines).toEqual([2, 4, 5])
  })
})

describe('example fence split options', () => {
  it('emits family, layout and ratio for md-example and js-example', () => {
    const md = render(fence('# hi', 'md-example layout=rl ratio="3:7" title="对比"'))
    expect(md).toContain('data-example-family="md"')
    expect(md).toContain('data-example-layout="rl"')
    expect(md).toContain('data-example-ratio="3:7"')

    const js = render(fence('console.log(1)', 'js-example layout=lr ratio=2:8'))
    expect(js).toContain('data-example-family="js"')
    expect(js).toContain('data-example-layout="lr"')
    expect(js).toContain('data-example-ratio="2:8"')
  })

  it('falls back to the family defaults when the info says nothing', () => {
    const md = render(fence('# hi', 'md-example'))
    expect(md).toContain('data-example-layout="lr"')
    expect(md).toContain('data-example-ratio="45:55"')
    const js = render(fence('console.log(1)', 'javascript-example'))
    expect(js).toContain('data-example-layout="tb"')
  })
})

describe('details container variants', () => {
  it('emits the variant attribute and renders the summary as inline markdown', () => {
    expect(render('::: details variant=card *标题*\n正文\n:::')).toContain('data-details-variant="card"')
    expect(render('::: details variant=card *标题*\n正文\n:::')).toContain('<summary><em>标题</em></summary>')
    expect(render('::: details open variant=plain 普通标题\n正文\n:::')).toContain('data-details-variant="plain"')
    expect(render('::: details open variant=plain 普通标题\n正文\n:::')).toContain('<details class="markdown-details" open')
  })

  it('leaves default variants without an attribute', () => {
    expect(render('::: details 标题\n正文\n:::')).not.toContain('data-details-variant')
  })
})

describe('table style container', () => {
  const table = '| a | b |\n| - | - |\n| 1 | 2 |'

  it('wraps the table with density, zebra and frames state', () => {
    const html = render(`::: table density=compact zebra frames=rows\n${table}\n:::`)
    expect(html).toContain('class="markdown-table"')
    expect(html).toContain('data-table-density="compact"')
    expect(html).toContain('data-table-zebra="true"')
    expect(html).toContain('data-table-frames="rows"')
    expect(html).toContain('<table>')
  })

  it('emits defaults when the header names nothing', () => {
    const html = render(`::: table\n${table}\n:::`)
    expect(html).toContain('data-table-density="cozy"')
    expect(html).toContain('data-table-frames="all"')
    expect(html).not.toContain('data-table-zebra')
  })
})

describe('app-native heavy blocks', () => {
  it('renders a mindmap placeholder carrying the encoded body, mode and theme annotation', () => {
    const html = render(fence('- root\n  - child', 'mindmap theme=dark'))
    expect(html).toContain('class="mindmap-block loading"')
    expect(html).toContain('data-mindmap-mode="outline"')
    expect(html).toContain('data-mindmap-theme="dark"')
    expect(html).toContain('data-mindmap-placeholder')
  })

  it('renders a JSON mindmap in json mode with no annotation', () => {
    const body = JSON.stringify({ nodeData: { id: 'root', topic: 'Root', children: [] } })
    const html = render(fence(body, 'mind-elixir'))
    expect(html).toContain('data-mindmap-mode="json"')
    expect(html).not.toContain('data-mindmap-theme')
  })

  it('snapshots a JSON kanban board as grouped card lists, hiding archived cards', () => {
    const board = {
      title: '计划',
      activeViewId: 'view-board',
      views: [{ id: 'view-board', type: 'board', groupBy: 'status' }],
      columns: [
        { id: 'status', name: 'Status', type: 'select', options: [
          { id: 'todo', label: 'Todo' },
          { id: 'done', label: 'Done' },
        ] },
      ],
      items: [
        { id: '1', title: '任务一', properties: { status: 'todo' } },
        { id: '2', title: '任务二', properties: { status: 'done' } },
        { id: '3', title: '已归档', properties: { status: 'todo' }, archived: true },
      ],
    }
    const html = render(fence(JSON.stringify(board), 'kanban'))
    expect(html).toContain('data-kanban-snapshot="1"')
    expect(html).toContain('kanban-snapshot-title">计划')
    expect(html).toContain('任务一')
    expect(html).toContain('任务二')
    expect(html).not.toContain('已归档')
  })

  it('snapshots an outline kanban body by heading groups', () => {
    const body = '## 进行中\n- 写代码\n## 完成\n- [x] 发布'
    const html = render(fence(body, 'board'))
    expect(html).toContain('kanban-snapshot-group">进行中')
    expect(html).toContain('kanban-snapshot-card">写代码</li>')
    expect(html).toContain('完成')
  })

  it('falls back to a source frame when a JSON kanban body is malformed', () => {
    const html = render(fence('{"items": "nope"}', 'kanban'))
    expect(html).toContain('class="static-block"')
    expect(html).toContain('解析失败')
  })

  it('frames excalidraw and slides fences with their source behind a disclosure', () => {
    const excalidraw = render(fence('{}', 'excalidraw'))
    expect(excalidraw).toContain('class="static-block"')
    expect(excalidraw).toContain('Excalidraw')
    expect(excalidraw).toContain('<details class="static-block-source"')

    const slides = render(fence('# 标题\n- 要点', 'slides'))
    expect(slides).toContain('class="static-block"')
    expect(slides).toContain('幻灯片')
  })
})
