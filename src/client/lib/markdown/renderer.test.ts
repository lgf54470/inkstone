import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '../i18n'
import { renderMarkdown } from './renderer'

beforeAll(async () => {
  await initI18n()
})

function parse(html: string): DocumentFragment {
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content
}

describe('renderMarkdown XSS hardening', () => {
  it('strips script tags and their content', () => {
    const rendered = renderMarkdown('<script>window.pwned = 1</script>')
    expect(rendered.html).not.toMatch(/<script/i)
    expect(rendered.html).not.toContain('pwned')
    expect(parse(rendered.html).querySelector('script')).toBeNull()
  })

  it('strips event handler attributes from inline HTML', () => {
    const rendered = renderMarkdown('<img src="x.png" onerror="alert(1)" onload="alert(2)">')
    parse(rendered.html).querySelectorAll('img').forEach((img) => {
      expect(img.getAttribute('onerror')).toBeNull()
      expect(img.getAttribute('onload')).toBeNull()
      expect(img.getAttribute('src')).toBe('x.png')
    })
    expect(rendered.html).not.toContain('onerror')
  })

  it('strips style attributes and style elements', () => {
    const rendered = renderMarkdown('<p style="position:fixed;inset:0">hi</p><style>p{display:none}</style>')
    expect(rendered.html).not.toContain('style')
    parse(rendered.html).querySelectorAll('p').forEach((p) => {
      expect(p.getAttribute('style')).toBeNull()
    })
    expect(parse(rendered.html).querySelector('p')!.textContent).toBe('hi')
  })

  it('strips SVG and MathML elements including mXSS-prone combinations', () => {
    const rendered = renderMarkdown(
      '<svg><g onload="alert(1)"><foreignObject><iframe src="https://evil"></iframe></foreignObject></g></svg>' +
        '<math><mtext><style><iframe></style></mtext></math>',
    )
    expect(rendered.html).not.toMatch(/<svg/i)
    expect(rendered.html).not.toMatch(/<math/i)
    expect(rendered.html).not.toMatch(/<iframe/i)
    expect(rendered.html).not.toMatch(/<foreignobject/i)
  })

  it('strips forms, inputs and embedded media from raw HTML, but keeps text', () => {
    const rendered = renderMarkdown(
      '<form action="https://evil.example"><input name="x" value="y"></form><iframe src="https://evil.example"></iframe><embed src="https://evil.example">',
    )
    const fragment = parse(rendered.html)
    expect(fragment.querySelector('form')).toBeNull()
    expect(fragment.querySelector('input')).toBeNull()
    expect(fragment.querySelector('iframe')).toBeNull()
    expect(fragment.querySelector('embed')).toBeNull()
  })

  it('strips javascript: URLs from links and images', () => {
    const links = renderMarkdown('[click](javascript:alert(1))')
    parse(links.html).querySelectorAll('a').forEach((anchor) => {
      expect(anchor.getAttribute('href')).toBeNull()
    })
    const images = renderMarkdown('<img src="javascript:alert(1)">')
    parse(images.html).querySelectorAll('img').forEach((img) => {
      expect(img.getAttribute('src')).toBeNull()
    })
  })

  it('blocks external https images by default', () => {
    const rendered = renderMarkdown('![](https://evil.example/track.png)')
    expect(rendered.html).not.toContain('<img')
    const figure = parse(rendered.html).querySelector('figure.image-blocked')
    expect(figure).not.toBeNull()
    expect(figure!.getAttribute('data-image-blocked')).toBe('https://evil.example/track.png')
  })

  it('keeps relative and same-origin image sources when blocked', () => {
    const rendered = renderMarkdown('![alt](/api/files/self.png)')
    const img = parse(rendered.html).querySelector('img')
    expect(img?.getAttribute('src')).toBe('/api/files/self.png')
  })

  it('renders external images when externalImages is explicitly allowed', () => {
    const rendered = renderMarkdown('![alt](https://evil.example/track.png)', { externalImages: true })
    const img = parse(rendered.html).querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://evil.example/track.png')
    expect(rendered.html).not.toContain('image-blocked')
  })

  it('forces noopener noreferrer on external links', () => {
    const rendered = renderMarkdown('[site](https://example.com)')
    const anchor = parse(rendered.html).querySelector('a')!
    expect(anchor.getAttribute('target')).toBe('_blank')
    expect(anchor.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('escapes raw HTML text content instead of executing it', () => {
    const rendered = renderMarkdown('<textarea>&lt;script&gt;</textarea>')
    expect(rendered.html).not.toMatch(/<textarea/i)
  })

  it('materializes task checkboxes as inputs after sanitization', () => {
    const rendered = renderMarkdown('- [ ] todo item\n- [x] done item')
    const inputs = parse(rendered.html).querySelectorAll<HTMLInputElement>('input.task-list-item-checkbox')
    expect(inputs).toHaveLength(2)
    expect(inputs[0]!.checked).toBe(false)
    expect(inputs[1]!.checked).toBe(true)
  })
})

describe('renderMarkdown extension golden output', () => {
  it('keeps callouts, tabs, details, math, mermaid, embeds and front matter intact', () => {
    const rendered = renderMarkdown(
      [
        '---',
        'title: Test',
        '---',
        '',
        '> [!danger] Watch out',
        '> danger body',
        '',
        ':::: tabs',
        '::: tab-item One',
        'first panel',
        ':::',
        '::: tab-item Two',
        'second panel',
        ':::',
        '::::',
        '',
        '::: details Open',
        'hidden body',
        ':::',
        '',
        'Inline $x^2$',
        '',
        '$$a+b$$',
        '',
        '```mermaid',
        'graph TD; A-->B',
        '```',
        '',
        '![[note-a|Label]]',
        '',
        '| a | b |',
        '|---|---|',
        '| 1 | 2 |',
      ].join('\n'),
    )
    const fragment = parse(rendered.html)
    expect(rendered.frontMatter.title).toBe('Test')
    expect(fragment.querySelector('aside.callout.callout-danger')).not.toBeNull()
    expect(fragment.querySelector('.markdown-tabs [data-tab-button="1"]')?.textContent).toBe('Two')
    expect(fragment.querySelector('details.markdown-details > summary')?.textContent).toBe('Open')
    expect(fragment.querySelector('span.math-inline[data-math]')).not.toBeNull()
    expect(fragment.querySelector('div.math-block[data-math]')).not.toBeNull()
    expect(fragment.querySelector('div.mermaid-block[data-mermaid]')).not.toBeNull()
    expect(fragment.querySelector('.note-embed[data-embed-target]')).not.toBeNull()
    expect(fragment.querySelector('table tbody td')?.textContent).toBe('1')
  })

  it('collects headings with level, text, slug and source line', () => {
    const rendered = renderMarkdown('# First\n\nparagraph\n\n## Second Heading\n\n### Third')
    expect(rendered.headings).toMatchObject([
      { level: 1, text: 'First', line: 0 },
      { level: 2, text: 'Second Heading', line: 4 },
      { level: 3, text: 'Third', line: 6 },
    ])
    expect(rendered.headings[1]!.slug).toBe('secondheading')
  })

  it('escapes user-controlled heading content and ids', () => {
    const rendered = renderMarkdown('# `"onmouseover="alert(1)`')
    const heading = parse(rendered.html).querySelector('h1')!
    expect(heading.getAttribute('onmouseover')).toBeNull()
    // The code text itself is escaped content, never a live attribute.
    expect(heading.querySelector('code')?.textContent).toBe('"onmouseover="alert(1)')
    expect(heading.querySelector('code')?.getAttribute('onmouseover')).toBeNull()
  })

  it('preserves table column alignments', () => {
    const rendered = renderMarkdown('| Left | Center | Right |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |')
    const fragment = parse(rendered.html)
    const ths = fragment.querySelectorAll('th')
    const tds = fragment.querySelectorAll('td')
    expect(ths[0]?.getAttribute('align')).toBe('left')
    expect(ths[1]?.getAttribute('align')).toBe('center')
    expect(ths[2]?.getAttribute('align')).toBe('right')
    expect(tds[0]?.getAttribute('align')).toBe('left')
    expect(tds[1]?.getAttribute('align')).toBe('center')
    expect(tds[2]?.getAttribute('align')).toBe('right')
  })

  it('renders runnable javascript-example blocks with controls and output panel', () => {
    const markdown = '~~~~javascript-example title="Demo"\nconsole.log("Hello");\n~~~~'
    const rendered = renderMarkdown(markdown)
    const fragment = parse(rendered.html)
    const block = fragment.querySelector('.js-example-block')
    expect(block).not.toBeNull()
    expect(block?.querySelector('.js-example-badge')?.textContent).toBe('JS')
    expect(block?.querySelector('.js-example-title')?.textContent).toContain('Demo')
    expect(block?.querySelector('[data-js-switch="line-numbers"]')).not.toBeNull()
    expect(block?.querySelector('[data-js-run]')).not.toBeNull()
    expect(block?.querySelector('.code-block[data-lang="javascript"]')).not.toBeNull()
    expect(block?.querySelector('.code-block pre code')?.textContent).toContain('console.log("Hello");')
    expect(block?.querySelector('.js-example-output')).not.toBeNull()
  })

  it('renders chart and mermaid blocks with data attributes', () => {
    const markdown = '```chart\n{"type":"bar"}\n```\n\n```mermaid\nflowchart TD\nA --> B\n```'
    const rendered = renderMarkdown(markdown)
    expect(rendered.hasChart).toBe(true)
    expect(rendered.hasMermaid).toBe(true)
    const fragment = parse(rendered.html)
    const chartBlock = fragment.querySelector('.chartjs-block')
    expect(chartBlock).not.toBeNull()
    expect(chartBlock?.getAttribute('data-chart')).toBeTruthy()
    const mermaidBlock = fragment.querySelector('.mermaid-block')
    expect(mermaidBlock).not.toBeNull()
    expect(mermaidBlock?.getAttribute('data-mermaid')).toBeTruthy()
  })

  it('renders subscript and superscript inline formatting', () => {
    const markdown = 'H~2~O and E = mc^2^'
    const rendered = renderMarkdown(markdown)
    const fragment = parse(rendered.html)
    expect(fragment.querySelector('sub')?.textContent).toBe('2')
    expect(fragment.querySelector('sup')?.textContent).toBe('2')
  })

  it('renders inserted and underlined inline formatting', () => {
    const markdown = 'This is ++inserted text++.'
    const rendered = renderMarkdown(markdown)
    const fragment = parse(rendered.html)
    expect(fragment.querySelector('ins')?.textContent).toBe('inserted text')
  })

  it('renders table of contents for [TOC] block', () => {
    const markdown = '[TOC]\n\n# Section One\n\n## Sub Section'
    const rendered = renderMarkdown(markdown)
    const fragment = parse(rendered.html)
    const toc = fragment.querySelector('nav.table-of-contents')
    expect(toc).not.toBeNull()
    const links = fragment.querySelectorAll('nav.table-of-contents a.toc-link')
    expect(links.length).toBe(2)
    expect(links[0]?.textContent).toBe('Section One')
    expect(links[0]?.getAttribute('href')).toBe('#sectionone')
    expect(links[1]?.textContent).toBe('Sub Section')
    expect(links[1]?.getAttribute('href')).toBe('#subsection')
  })

  it('renders emoji shortcodes while preserving ascii emoticons', () => {
    const markdown = ':tada: :fire: :rocket: :)'
    const rendered = renderMarkdown(markdown)
    expect(rendered.html).toContain('🎉')
    expect(rendered.html).toContain('🔥')
    expect(rendered.html).toContain('🚀')
    expect(rendered.html).toContain(':)')
  })

  it('renders definition lists into dl, dt, dd elements', () => {
    const markdown = 'Term 1\n: Definition 1\n\nTerm 2\n: Definition 2'
    const rendered = renderMarkdown(markdown)
    const fragment = parse(rendered.html)
    const dl = fragment.querySelector('dl')
    expect(dl).not.toBeNull()
    const dts = fragment.querySelectorAll('dt')
    const dds = fragment.querySelectorAll('dd')
    expect(dts.length).toBe(2)
    expect(dds.length).toBe(2)
    expect(dts[0]?.textContent).toBe('Term 1')
    expect(dds[0]?.textContent).toBe('Definition 1')
    expect(dts[1]?.textContent).toBe('Term 2')
    expect(dds[1]?.textContent).toBe('Definition 2')
  })

  it('renders abbreviations with title attributes', () => {
    const markdown = '*[HTML]: HyperText Markup Language\n\nLearn HTML today.'
    const rendered = renderMarkdown(markdown)
    const fragment = parse(rendered.html)
    const abbr = fragment.querySelector('abbr')
    expect(abbr).not.toBeNull()
    expect(abbr?.textContent).toBe('HTML')
    expect(abbr?.getAttribute('title')).toBe('HyperText Markup Language')
  })

  it('renders extended task list items with correct status attributes', () => {
    const markdown = '- [/] In Progress\n- [-] Cancelled\n- [?] Question\n- [!] Important'
    const rendered = renderMarkdown(markdown)
    const fragment = parse(rendered.html)
    const inputs = fragment.querySelectorAll<HTMLInputElement>('input.task-list-item-checkbox')
    expect(inputs.length).toBe(4)
    expect(inputs[0]?.dataset.taskStatus).toBe('in-progress')
    expect(inputs[1]?.dataset.taskStatus).toBe('cancelled')
    expect(inputs[2]?.dataset.taskStatus).toBe('question')
    expect(inputs[3]?.dataset.taskStatus).toBe('important')
  })
})