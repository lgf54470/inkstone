import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from './i18n'
import { exportNoteAsMarkdown, renderNoteToExportHtml } from './export-note'

beforeAll(async () => {
  await initI18n()
})

describe('export-note', () => {
  it('formats markdown export with title frontmatter', () => {
    const clickSpy = vi.fn()
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) {
        node.click = clickSpy
      }
      return node
    })

    exportNoteAsMarkdown({ title: 'My Note', content: '# Hello\nWorld' })

    expect(clickSpy).toHaveBeenCalled()
    appendSpy.mockRestore()
  })

  it('renders all markdown features into self-contained html document', async () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = (() => ({
      canvas: document.createElement('canvas'),
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      measureText: () => ({ width: 0 }),
      save: () => {},
      restore: () => {},
    })) as never

    try {
      const markdownContent = [
        '# Title',
        '',
        '- [x] Done task',
        '- [/] In progress task',
        '- [-] Cancelled task',
        '',
        'Formula: $E=mc^2$',
        '',
        '```typescript',
        'const x: number = 42;',
        '```',
        '',
        '::: details Detail Title',
        'Some content inside details',
        ':::',
      ].join('\n')

      const html = await renderNoteToExportHtml({ title: 'Test Note', content: markdownContent }, 'zh-CN')

      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('<title>Test Note</title>')
      expect(html).toContain('.task-status-in-progress')
      expect(html).toContain('.task-status-cancelled')
      expect(html).toContain('.code-block')
      expect(html).toContain('katex')
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext
    }
  })
})
