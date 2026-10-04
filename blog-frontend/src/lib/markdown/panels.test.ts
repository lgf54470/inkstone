// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './index'
import { matchPanelHeader, parseTimelineItem } from './panel-options'

function render(md: string): string {
  return renderMarkdown(md).html
}

function doc(md: string): Document {
  return new DOMParser().parseFromString(render(md), 'text/html')
}

function attr(root: Document, selector: string, name: string): string | undefined {
  return root.querySelector(selector)?.getAttribute(name) ?? undefined
}

describe('::: alignment panels', () => {
  it('wraps the body in a div that carries the alignment and keeps markdown inside', () => {
    const block = doc('::: center\nhello *world*\n:::').querySelector('.markdown-align')
    expect(block?.getAttribute('data-align')).toBe('center')
    expect(block?.querySelector('p em')?.textContent).toBe('world')
  })

  it('accepts every one-letter spelling', () => {
    for (const [word, align] of [['l', 'left'], ['c', 'center'], ['r', 'right'], ['j', 'justify']] as const) {
      expect(attr(doc(`::: ${word}\nbody\n:::`), '.markdown-align', 'data-align')).toBe(align)
    }
  })

  it('leaves an unrecognised header as the plain text it always was', () => {
    const html = render('::: whatever\nbody\n:::')
    expect(html).not.toContain('markdown-align')
    expect(html).toContain('::: whatever')
  })
})

describe('::: cols panels read their separators', () => {
  it('splits on a bare :: and keeps the separators out of the content', () => {
    const root = doc('::: cols\none\n::\ntwo\n::\nthree\n:::')
    expect(attr(root, '.markdown-cols', 'data-cols')).toBe('3')
    const cols = [...root.querySelectorAll('.markdown-col')]
    expect(cols.map((col) => col.textContent?.trim())).toEqual(['one', 'two', 'three'])
    expect(cols[0]?.getAttribute('data-col')).toBe('0')
  })

  it('pads a stated count with an empty column and folds the overflow into the last', () => {
    const padded = doc('::: 3cols\none\n::\ntwo\n:::')
    expect(attr(padded, '.markdown-cols', 'data-cols')).toBe('3')
    const texts = [...padded.querySelectorAll('.markdown-col')].map((col) => col.textContent?.trim())
    expect(texts).toEqual(['one', 'two', ''])
    expect(doc('::: cols 2\na\n::\nb\n::\nc\n:::').querySelectorAll('.markdown-col')).toHaveLength(2)
  })

  it('caps the column count at the range the stylesheet draws', () => {
    const eight = doc('::: cols 9\na\n::\nb\n::\nc\n::\nd\n::\ne\n::\nf\n::\ng\n::\nh\n:::')
    expect(Number(attr(eight, '.markdown-cols', 'data-cols'))).toBeLessThanOrEqual(6)
  })
})

describe('::: cols panels header options', () => {
  it('emits tracks, gap, divider and content alignment as data hooks, never as a style', () => {
    const block = doc('::: cols 1fr 2fr gap=wide divider center\none\n::\ntwo\n:::').querySelector('.markdown-cols')
    expect(block?.getAttribute('data-cols-tracks')).toBe('1fr 2fr')
    expect(block?.getAttribute('data-cols-gap')).toBe('wide')
    expect(block?.getAttribute('data-cols-divider')).toBe('true')
    expect(block?.getAttribute('data-cols-align')).toBe('center')
    expect(block?.getAttribute('style')).toBeNull()
  })

  it('drops a single track token, which cannot describe a grid on its own', () => {
    const block = doc('::: cols 1fr\none\n::\ntwo\n:::').querySelector('.markdown-cols')
    expect(block?.hasAttribute('data-cols-tracks')).toBe(false)
  })

  it('escapes a header value that tries to leave its attribute', () => {
    const html = render('::: cols center" onload="alert(1)\none\n::: ')
    expect(html).not.toContain('onload')
    expect(html).not.toContain('<script')
  })
})

describe('::: cols panels keep other syntax inert', () => {
  it('treats a separator inside a code fence as text', () => {
    const root = doc('::: cols\nfirst\n::\n```\na :: b\n::: not a close\n```\n:::')
    expect(attr(root, '.markdown-cols', 'data-cols')).toBe('2')
    const code = root.querySelector('.markdown-col:nth-child(2) code')?.textContent ?? ''
    expect(code).toContain('a :: b')
    expect(code).toContain('::: not a close')
  })

  it('leaves separators inside a nested container to that container', () => {
    const root = doc('::: cols\nouter\n::\n::: tabs\n:: inner\npanel\n:::\n:::')
    expect(attr(root, '.markdown-cols', 'data-cols')).toBe('2')
    expect(root.querySelectorAll('.markdown-col')).toHaveLength(2)
    expect(root.querySelectorAll('.markdown-col [data-tab-button]')).toHaveLength(1)
  })

  it('nests a callout in a column without either block losing its content', () => {
    const root = doc('::: cols\n::: tip\ninside\n:::\n::\nafter\n:::')
    expect(root.querySelectorAll('.markdown-col')).toHaveLength(2)
    expect(root.querySelector('.markdown-col .callout')?.textContent).toContain('inside')
    expect(root.querySelectorAll('.markdown-col')[1]?.textContent).toContain('after')
  })
})

describe('::: tabs written with :: marks', () => {
  it('renders the same tablist the @tab spelling renders, first panel selected', () => {
    const root = doc('::: tabs\n:: first\npanel one\n:: second\npanel two\n:::')
    const buttons = [...root.querySelectorAll('[data-tab-button]')]
    expect(buttons.map((button) => button.textContent)).toEqual(['first', 'second'])
    expect(buttons[0]?.getAttribute('aria-selected')).toBe('true')
    expect(buttons[1]?.getAttribute('aria-selected')).toBe('false')
    expect(root.querySelector('[data-tab-panel="1"]')?.hasAttribute('hidden')).toBe(true)
  })

  it('renders the panels as markdown rather than as the source text', () => {
    const root = doc('::: tabs\n:: first\n- one\n- two\n:::')
    expect(root.querySelectorAll('[data-tab-panel] li')).toHaveLength(2)
  })

  it('accepts the t abbreviation and still reads the options after it', () => {
    const block = doc('::: t pills center\n:: one\nA\n:::').querySelector('.markdown-tabs')
    expect(block?.getAttribute('data-tabs-variant')).toBe('pills')
    expect(block?.getAttribute('data-tabs-align')).toBe('center')
  })

  it('names an untitled panel with the shared fallback and strips a bracketed title', () => {
    const untitled = doc('::: tabs\n::\nbody\n:::').querySelector('[data-tab-button]')
    expect(untitled?.textContent).toBe('标签页')
    const bracketed = doc('::: tabs\n:: [Overview]\nbody\n:::').querySelector('[data-tab-button]')
    expect(bracketed?.textContent).toBe('Overview')
  })

  it('prefers the @tab spelling when a post already uses it', () => {
    const root = doc('::: tabs\n@tab A\none\n@tab B\ntwo\n:::')
    const buttons = [...root.querySelectorAll('[data-tab-button]')]
    expect(buttons.map((button) => button.textContent)).toEqual(['A', 'B'])
  })

  it('leaves a tabs block that marks no panel at all empty, as it always was', () => {
    expect(render('::: tabs\nnothing marks a tab here\n:::')).not.toContain('data-tab-button')
  })
})

describe('::: timeline panels', () => {
  it('draws one list item per :: node, split into status, time, title and body', () => {
    const root = doc('::: timeline\n:: [done] 2024-01-15 发布\ndetails\n:::')
    expect(root.querySelectorAll('ol.markdown-timeline > li.markdown-timeline-item')).toHaveLength(1)
    expect(attr(root, '.markdown-timeline-item', 'data-status')).toBe('done')
    expect(root.querySelector('.markdown-timeline-time')?.textContent).toBe('2024-01-15')
    expect(attr(root, '.markdown-timeline-time', 'data-datetime')).toBe('2024-01-15')
    expect(root.querySelector('.markdown-timeline-title')?.textContent).toBe('发布')
    expect(root.querySelector('.markdown-timeline-body p')?.textContent).toBe('details')
  })

  it('says the status in words, so it does not travel by colour alone', () => {
    const root = doc('::: timeline\n:: [milestone] v1.0 launch\n:::')
    expect(attr(root, '.markdown-timeline-item', 'data-status')).toBe('milestone')
    expect(root.querySelector('.markdown-timeline-status')?.textContent).toBe('里程碑')
  })

  it('keeps a leading word that is not a date in the title', () => {
    const root = doc('::: timeline\n:: 第三章 小结\n:::')
    expect(root.querySelector('.markdown-timeline-time')).toBeNull()
    expect(root.querySelector('.markdown-timeline-title')?.textContent).toBe('第三章 小结')
  })

  it('renders the title through the inline rules so a link stays a link', () => {
    const root = doc('::: timeline\n:: 2024-01-01 see [the docs](https://example.com)\n:::')
    expect(root.querySelector('.markdown-timeline-title a')?.getAttribute('href')).toBe('https://example.com')
  })

  it('keeps a footnote that the post ends with out of the caption and the node title', () => {
    const html = render('::: timeline 里程碑\n:: [done] 发布\n:::\n\n引用[^a]\n\n[^a]: 注释\n')
    expect(html).toContain('<div class="markdown-timeline-caption">里程碑</div>')
    expect(html).toContain('<span class="markdown-timeline-title">发布</span>')
  })

  it('writes the status word in the language the page was rendered for', () => {
    const html = renderMarkdown('::: timeline\n:: [doing] x\n:::', { locale: 'en-US' }).html
    expect(html).toContain('markdown-timeline-status">Doing<')
  })

  it('maps the symbol aliases and an unknown marker onto the five vocabulary values', () => {
    expect(parseTimelineItem('[✓] 1 done').status).toBe('done')
    expect(parseTimelineItem('[x] 1 done').status).toBe('done')
    expect(parseTimelineItem('[!] 1 bad').status).toBe('error')
    expect(parseTimelineItem('[★] v1 launch').status).toBe('milestone')
    expect(parseTimelineItem('[wat] later').status).toBe('todo')
  })
})

describe('::: callout panels', () => {
  it('emits byte-identical markup to the blockquote spelling of the same type', () => {
    const fenced = doc('::: tip My title\nbody\n:::').querySelector('.callout')
    const quoted = doc('> [!tip] My title\n> body').querySelector('.callout')
    expect(fenced?.outerHTML).toBe(quoted?.outerHTML)
  })

  it('accepts the one-letter spellings, with p resolving to note', () => {
    for (const [word, type] of [['p', 'note'], ['i', 'info'], ['w', 'warning'], ['d', 'danger'], ['s', 'success']] as const) {
      expect(attr(doc(`::: ${word}\nbody\n:::`), '.callout', 'data-callout')).toBe(type)
    }
  })

  it('folds on a trailing minus and starts open on a plus', () => {
    const closed = doc('::: tip- hidden\nbody\n:::').querySelector('.callout')
    expect(closed?.tagName).toBe('DETAILS')
    expect(closed?.hasAttribute('open')).toBe(false)
    const open = doc('::: tip+ shown\nbody\n:::').querySelector('.callout')
    expect(open?.hasAttribute('open')).toBe(true)
  })
})

describe('panel header grammar', () => {
  it('claims only the closed keyword set', () => {
    expect(matchPanelHeader('::: cols 1fr 2fr')?.header.kind).toBe('cols')
    expect(matchPanelHeader('::: t')?.header.kind).toBe('tabs')
    expect(matchPanelHeader(':: centre')).toBeNull()
    expect(matchPanelHeader('::: whatever')).toBeNull()
    expect(matchPanelHeader(':::{tab-set}')).toBeNull()
  })

  it('keeps the marker length so a longer fence closes on its own spelling', () => {
    expect(matchPanelHeader(':::: center')?.markerLength).toBe(4)
  })
})

describe('the lines a timeline node holds', () => {
  it('keeps the paragraphs the node itself holds apart', () => {
    const root = doc('::: timeline\n:: [done] Ship\nfocus mode\nimage preview\n:::')
    const para = root.querySelector('.markdown-timeline-body p')
    expect(para?.querySelectorAll('br')).toHaveLength(1)
    expect(para?.textContent).toBe('focus mode\nimage preview')
  })

  it('leaves a list inside the node on the same line rules as everywhere else', () => {
    const root = doc('::: timeline\n:: [done] Ship\n- alpha\n- beta\n:::')
    expect(root.querySelectorAll('.markdown-timeline-body ul li')).toHaveLength(2)
    expect(root.querySelector('.markdown-timeline-body ul br')).toBeNull()
  })
})
