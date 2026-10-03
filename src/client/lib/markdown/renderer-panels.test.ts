import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '../i18n'
import { renderMarkdown } from './renderer'

beforeAll(async () => {
  await initI18n()
})

function markup(source: string): string {
  return renderMarkdown(source).html
}

function fragment(source: string): DocumentFragment {
  const template = document.createElement('template')
  template.innerHTML = markup(source)
  return template.content
}

function first(root: DocumentFragment, selector: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(selector)
}

function columns(root: DocumentFragment): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.markdown-col')]
}

describe('::: alignment containers', () => {
  it('centers a paragraph and keeps its content as ordinary markdown', () => {
    const block = first(fragment('::: center\nhello\nsecond line\n:::'), '.markdown-align')
    expect(block?.dataset.align).toBe('center')
    expect(block?.querySelector('p')?.textContent).toBe('hello\nsecond line')
  })

  it('accepts the one-letter spellings of every alignment', () => {
    for (const [word, align] of [['l', 'left'], ['c', 'center'], ['r', 'right'], ['j', 'justify']] as const) {
      expect(first(fragment(`::: ${word}\nbody\n:::`), '.markdown-align')?.dataset.align).toBe(align)
    }
  })

  it('aligns whatever the body holds, not only paragraphs', () => {
    const block = first(fragment('::: center\n## Title\n- one\n- two\n:::'), '.markdown-align')
    expect(block?.querySelector('h2')).not.toBeNull()
    expect(block?.querySelectorAll('li')).toHaveLength(2)
  })

  it('carries the header line so the block can be found again after an edit', () => {
    expect(first(fragment('intro\n\n::: center\nbody\n:::'), '.markdown-align')?.dataset.line).toBe('2')
  })

  it('interrupts a paragraph the way the other containers do', () => {
    const html = markup('before\n::: center\nbody\n:::')
    expect(html).toContain('<div class="markdown-align" data-align="center" data-line="1">')
  })

  it('leaves an unrecognised header as the plain text it always was', () => {
    const html = markup('::: whatever\nbody\n:::')
    expect(html).not.toContain('markdown-align')
    expect(html).toContain('::: whatever')
  })

  it('cannot be given an alignment the vocabulary does not know', () => {
    expect(markup('::: centre\nbody\n:::')).not.toContain('markdown-align')
  })
})

describe('::: cols containers', () => {
  it('infers the column count from the separators and keeps the separators out of the content', () => {
    const root = fragment('::: cols\none\n::\ntwo\n::\nthree\n:::')
    const block = first(root, '.markdown-cols')
    expect(block?.dataset.cols).toBe('3')
    expect(columns(root).map((col) => col.textContent?.trim())).toEqual(['one', 'two', 'three'])
  })

  it('drops the empty column a separator before the closing fence would leave', () => {
    const block = first(fragment('::: cols\none\n::\ntwo\n::\n:::'), '.markdown-cols')
    expect(block?.dataset.cols).toBe('2')
  })

  it('holds any block content in a column, including a nested container', () => {
    const root = fragment('::: cols\n| a | b |\n|---|---|\n| 1 | 2 |\n::\n> quoted\n:::')
    expect(first(root, '.markdown-col table')).not.toBeNull()
    expect(first(root, '.markdown-col:nth-child(2) blockquote')).not.toBeNull()
  })

  it('reads a stated column count over the separators, padding and folding to fit', () => {
    const padded = fragment('::: 3cols\none\n::\ntwo\n:::')
    expect(first(padded, '.markdown-cols')?.dataset.cols).toBe('3')
    expect(columns(padded).map((col) => col.textContent?.trim())).toEqual(['one', 'two', ''])

    const folded = fragment('::: cols 2\none\n::\ntwo\n::\nthree\n:::')
    expect(first(folded, '.markdown-cols')?.dataset.cols).toBe('2')
    expect(folded.querySelectorAll('.markdown-col')).toHaveLength(2)
  })

  it('keeps a column count inside the range the stylesheet draws', () => {
    const block = first(fragment('::: cols 9\na\n::\nb\n::\nc\n::\nd\n::\ne\n::\nf\n::\ng\n::\nh\n::\ni\n:::\n'), '.markdown-cols')
    expect(Number(block?.dataset.cols)).toBeLessThanOrEqual(6)
  })

  it('carries the track sizes, gap, divider and content alignment the header states', () => {
    const block = first(fragment('::: cols 1fr 2fr gap=wide divider center\none\n::\ntwo\n:::'), '.markdown-cols')
    expect(block?.dataset.colsTracks).toBe('1fr 2fr')
    expect(block?.dataset.colsGap).toBe('wide')
    expect(block?.dataset.colsDivider).toBe('true')
    expect(block?.dataset.colsAlign).toBe('center')
  })

  it('ignores a single track token, which cannot describe a grid on its own', () => {
    const block = first(fragment('::: cols 1fr\none\n::\ntwo\n:::'), '.markdown-cols')
    expect(block?.dataset.colsTracks).toBeUndefined()
  })

  it('treats a separator inside a code fence as text', () => {
    const root = fragment('::: cols\nfirst\n::\n```\na :: b\n::: not a close\n```\n:::')
    const block = first(root, '.markdown-cols')
    expect(block?.dataset.cols).toBe('2')
    expect(root.querySelector('.markdown-col:nth-child(2) code')?.textContent).toBe('a :: b\n::: not a close\n')
  })

  it('leaves separators inside a nested container to that container', () => {
    const root = fragment('::: cols\nouter\n::\n::: tabs\n:: inner\npanel\n:::\n:::')
    const block = first(root, '.markdown-cols')
    expect(block?.dataset.cols).toBe('2')
    expect(root.querySelectorAll('.markdown-col')).toHaveLength(2)
    expect(root.querySelectorAll('.markdown-col [data-tab-button]')).toHaveLength(1)
  })

  it('escapes a header value that tries to leave its attribute', () => {
    const html = markup('::: cols center" onload="alert(1)\none\n::: ')
    expect(html).not.toContain('onload="alert')
    expect(html).not.toContain('<script')
  })
})

describe('::: tabs written with :: marks', () => {
  it('renders a real tablist whose first panel is the selected one', () => {
    const root = fragment('::: tabs\n:: first\npanel one\n:: second\npanel two\n:::')
    const buttons = [...root.querySelectorAll('[data-tab-button]')]
    expect(buttons.map((button) => button.textContent)).toEqual(['first', 'second'])
    expect(buttons[0]!.getAttribute('aria-selected')).toBe('true')
    expect(buttons[1]!.getAttribute('aria-selected')).toBe('false')
    const panels = [...root.querySelectorAll('[data-tab-panel]')]
    expect(panels[0]!.hasAttribute('hidden')).toBe(false)
    expect(panels[1]!.hasAttribute('hidden')).toBe(true)
  })

  it('renders the panels as markdown rather than as the source text', () => {
    const root = fragment('::: tabs\n:: first\n- one\n- two\n:::')
    expect(root.querySelectorAll('[data-tab-panel] li')).toHaveLength(2)
  })

  it('accepts the t abbreviation and still reads the options after it', () => {
    const block = first(fragment('::: t pills center\n:: one\nA\n:::'), '.markdown-tabs')
    expect(block?.dataset.tabsVariant).toBe('pills')
    expect(block?.dataset.tabsAlign).toBe('center')
  })

  it('names an untitled panel with the shared fallback instead of leaving it nameless', () => {
    const button = first(fragment('::: tabs\n::\nbody\n:::'), '[data-tab-button]')
    expect(button?.textContent).toBe('Tabs')
  })

  it('keeps writing a bracketed title without its brackets', () => {
    const button = first(fragment('::: tabs\n:: [Overview]\nbody\n:::'), '[data-tab-button]')
    expect(button?.textContent).toBe('Overview')
  })

  it('prefers the @tab spelling when a note already uses it', () => {
    const root = fragment('::: tabs\n@tab A\none\n@tab B\ntwo\n:::')
    expect([...root.querySelectorAll('[data-tab-button]')].map((button) => button.textContent)).toEqual(['A', 'B'])
  })

  it('leaves a tabs block that marks no panel at all empty, as it always was', () => {
    expect(markup('::: tabs\nnothing marks a tab here\n:::')).not.toContain('data-tab-button')
  })
})

describe('the header written without a space', () => {
  it('claims every kind the way the reference implementation spells it', () => {
    expect(first(fragment(':::center\nbody\n:::'), '.markdown-align')?.dataset.align).toBe('center')
    expect(first(fragment(':::cols\na\n::\nb\n:::'), '.markdown-cols')?.dataset.cols).toBe('2')
    expect(first(fragment(':::timeline\n:: [done] 2024-01-01 A\n:::'), '.markdown-timeline')).not.toBeNull()
    expect(first(fragment(':::tip T\nbody\n:::'), '.callout')?.dataset.callout).toBe('tip')
    expect(first(fragment(':::tabs\n:: one\nA\n:::'), '[data-tab-button]')?.textContent).toBe('one')
  })

  it('still needs the closing fence to carry at least as many colons as the header', () => {
    const block = first(fragment('::::cols\na\n::\nb\n::::'), '.markdown-cols')
    expect(block?.dataset.cols).toBe('2')
    expect(markup(':::cols\nbody\n')).toContain(':::cols')
  })

  it('does not claim a bare fence or an unknown word written tight against it', () => {
    expect(markup(':::\nbody\n:::')).not.toContain('markdown-align')
    expect(markup(':::whatever\nbody\n:::')).not.toContain('markdown-align')
  })

  it('leaves the brace directive to the tabs block that already owns it', () => {
    const root = fragment('::::{tab-set}\n::: tab-item A\nx\n:::\n::::')
    expect([...root.querySelectorAll('[data-tab-button]')].map((b) => b.textContent)).toEqual(['A'])
    expect(root.querySelector('.markdown-align')).toBeNull()
  })
})

describe('::: timeline containers', () => {
  it('draws the nodes as an ordered list of events', () => {
    const root = fragment('::: timeline\n:: 2024-01-01 first\n:: 2024-02-01 second\n:::')
    expect(first(root, 'ol.markdown-timeline')).not.toBeNull()
    expect(root.querySelectorAll('ol.markdown-timeline > li.markdown-timeline-item')).toHaveLength(2)
  })

  it('keeps the title the header carries instead of dropping it', () => {
    const root = fragment('::: timeline The long history\n:: [done] 2024-01-01 first\n:::')
    expect(first(root, '.markdown-timeline-caption')?.textContent).toBe('The long history')
    expect(first(root, '.markdown-timeline-block ol.markdown-timeline')).not.toBeNull()
  })

  it('renders the title through the inline rules and leaves it out when there is none', () => {
    const linked = first(fragment('::: timeline see [the docs](https://example.com)\n:: [done] A\n:::'), '.markdown-timeline-caption')
    expect(linked?.querySelector('a')?.getAttribute('href')).toBe('https://example.com')
    expect(first(fragment('::: timeline\n:: [done] A\n:::'), '.markdown-timeline-caption')).toBeNull()
  })

  it('splits a node line into status, date and title', () => {
    const root = fragment('::: timeline\n:: [done] 2024-01-15 shipped\ndetails here\n:::')
    const item = first(root, '.markdown-timeline-item')
    expect(item?.dataset.status).toBe('done')
    expect(first(root, '.markdown-timeline-time')?.textContent).toBe('2024-01-15')
    expect(first(root, '.markdown-timeline-time')?.dataset.datetime).toBe('2024-01-15')
    expect(first(root, '.markdown-timeline-title')?.textContent).toBe('shipped')
    expect(item?.querySelector('.markdown-timeline-body p')?.textContent).toBe('details here')
  })

  it('says the status in words, so it does not travel by colour alone', () => {
    const root = fragment('::: timeline\n:: [milestone] v1.0 launch\n::: ')
    expect(first(root, '.markdown-timeline-item')?.dataset.status).toBe('milestone')
    expect(first(root, '.markdown-timeline-status')?.textContent).toBe('Milestone')
  })

  it('treats an unknown status marker as a plain node', () => {
    const item = first(fragment('::: timeline\n:: [wat] later\n:::'), '.markdown-timeline-item')
    expect(item?.dataset.status).toBe('todo')
  })

  it('keeps a leading word that is not a date in the title', () => {
    const root = fragment('::: timeline\n:: chapter one summary\n:::')
    expect(first(root, '.markdown-timeline-time')).toBeNull()
    expect(first(root, '.markdown-timeline-title')?.textContent).toBe('chapter one summary')
  })

  it('records a version-ish label as a date-less time', () => {
    const time = first(fragment('::: timeline\n:: v1.0 launch\n:::'), '.markdown-timeline-time')
    expect(time?.textContent).toBe('v1.0')
    expect(time?.dataset.datetime).toBeUndefined()
  })

  it('renders the title through the inline rules so a link stays a link', () => {
    const title = first(fragment('::: timeline\n:: 2024-01-01 see [the docs](https://example.com)\n:::'), '.markdown-timeline-title')
    expect(title?.querySelector('a')?.getAttribute('href')).toBe('https://example.com')
  })
})

describe('::: callout containers', () => {
  it('draws the same element as the blockquote spelling of the same type', () => {
    const fenced = first(fragment('::: tip My title\nbody\n:::'), '.callout')
    const quoted = first(fragment('> [!tip] My title\n> body'), '.callout')
    expect(fenced?.outerHTML.replace(/ data-line="\d+"/, '')).toBe(quoted?.outerHTML.replace(/ data-line="\d+"/, ''))
  })

  it('accepts the one-letter spellings the panel syntax has always used', () => {
    for (const [word, type] of [['p', 'note'], ['i', 'info'], ['w', 'warning'], ['d', 'danger'], ['s', 'success']] as const) {
      expect(first(fragment(`::: ${word}\nbody\n:::`), '.callout')?.dataset.callout).toBe(type)
    }
  })

  it('falls back to the type name when the note gives no title', () => {
    expect(first(fragment('::: warning\nbody\n:::'), '.callout-title')?.textContent).toBe('Warning')
  })

  it('folds on a trailing minus and starts open on a plus', () => {
    const closed = first(fragment('::: tip- hidden\nbody\n:::'), '.callout')
    expect(closed?.tagName).toBe('DETAILS')
    expect(closed?.hasAttribute('open')).toBe(false)
    const open = first(fragment('::: tip+ shown\nbody\n:::'), '.callout')
    expect(open?.tagName).toBe('DETAILS')
    expect(open?.hasAttribute('open')).toBe(true)
  })
})

describe('panel containers in the surrounding document', () => {
  it('nests inside a column without either block losing its own content', () => {
    const root = fragment('::: cols\n::: tip\ninside\n:::\n::\nafter\n:::')
    expect(root.querySelectorAll('.markdown-col')).toHaveLength(2)
    expect(first(root, '.markdown-col .callout')?.textContent).toContain('inside')
    expect(root.querySelectorAll('.markdown-col')[1]!.textContent).toContain('after')
  })

  it('survives the sanitizer with every hook the stylesheets and enhancers read still attached', () => {
    const root = fragment('::: cols 1fr 2fr gap=narrow divider justify\none\n::\ntwo\n:::')
    const block = first(root, '.markdown-cols')
    expect(block?.dataset.colsTracks).toBe('1fr 2fr')
    expect(block?.dataset.colsAlign).toBe('justify')
    expect(block?.getAttribute('style')).toBeNull()
  })
})
