import { describe, expect, it } from 'vitest'
import { pasteSlideRichText, sanitizeSlideRichText, sanitizeSlideSvgMarkup } from './sanitize'

describe('sanitizeSlideRichText', () => {
  it('keeps the formatting a slide may carry and drops everything else', () => {
    expect(sanitizeSlideRichText('<b>bold</b><i>it</i><u>u</u><br><code>x</code>')).toBe(
      '<b>bold</b><i>it</i><u>u</u><br><code>x</code>',
    )
    expect(sanitizeSlideRichText('<ul><li>one</li><li>two</li></ul>')).toBe(
      '<ul><li>one</li><li>two</li></ul>',
    )
  })

  it('strips script, event handlers and styles, keeping the words', () => {
    expect(sanitizeSlideRichText('<script>alert(1)</script>after')).toBe('after')
    expect(sanitizeSlideRichText('<img src=x onerror=alert(1)>')).toBe('')
    expect(sanitizeSlideRichText('<span style="color:red">red</span>')).toBe('<span>red</span>')
    expect(sanitizeSlideRichText('<div onclick="alert(1)">click</div>')).toBe('<div>click</div>')
  })

  it('unwraps an unknown element but keeps the text it held', () => {
    expect(sanitizeSlideRichText('<marquee>kept</marquee>')).toBe('kept')
    expect(sanitizeSlideRichText('<p>a<custom-b>c</custom-b></p>')).toBe('<p>ac</p>')
  })

  it('keeps a web link, refuses a script link, and opens it in its own tab', () => {
    expect(sanitizeSlideRichText('<a href="https://example.com">go</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">go</a>',
    )
    expect(sanitizeSlideRichText('<a href="javascript:alert(1)">go</a>')).toBe('<a>go</a>')
    expect(sanitizeSlideRichText('<a href="data:text/html,<script>alert(1)</script>">go</a>')).toBe(
      '<a>go</a>',
    )
  })
})

describe('sanitizeSlideSvgMarkup', () => {
  it('draws the vocabulary a deck asset uses', () => {
    const markup =
      '<svg viewBox="0 0 10 10"><defs><radialGradient id="g"><stop offset="0" stop-color="#fff"/></radialGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>'
    expect(sanitizeSlideSvgMarkup(markup)).toContain('radialGradient')
    expect(sanitizeSlideSvgMarkup(markup)).toContain('url(#g)')
  })

  it('drops scripts, event handlers, foreign content and animation', () => {
    expect(sanitizeSlideSvgMarkup('<svg><script>alert(1)</script><rect/></svg>')).toBe(
      '<svg><rect></rect></svg>',
    )
    expect(sanitizeSlideSvgMarkup('<svg onload="alert(1)"><rect/></svg>')).toBe(
      '<svg><rect></rect></svg>',
    )
    expect(sanitizeSlideSvgMarkup('<svg><foreignObject><body>hi</body></foreignObject></svg>')).toBe(
      '<svg></svg>',
    )
    expect(sanitizeSlideSvgMarkup('<svg><animate attributeName="href" to="javascript:1"/></svg>')).toBe(
      '<svg></svg>',
    )
  })

  it('removes a remote reference but keeps an in-document one', () => {
    expect(sanitizeSlideSvgMarkup('<svg><image href="https://tracker.example/x.png"/></svg>')).toBe(
      '<svg><image></image></svg>',
    )
    expect(sanitizeSlideSvgMarkup('<svg><use href="#shape"/></svg>')).toBe(
      '<svg><use href="#shape"></use></svg>',
    )
    expect(sanitizeSlideSvgMarkup('<svg><use href="https://evil.example/x.svg#s"/></svg>')).toBe(
      '<svg><use></use></svg>',
    )
    expect(
      sanitizeSlideSvgMarkup('<svg><image href="data:image/png;base64,AAA"/></svg>'),
    ).toContain('data:image/png;base64,AAA')
  })

  it('returns nothing for empty markup', () => {
    expect(sanitizeSlideSvgMarkup('')).toBe('')
  })
})

function targetWithCaret(): HTMLElement {
  const target = document.createElement('div')
  target.innerHTML = '<span id="lead">lead</span><span id="tail">tail</span>'
  document.body.append(target)
  const range = document.createRange()
  const lead = target.querySelector('#lead')
  if (!lead) throw new Error('missing lead')
  range.setStartAfter(lead)
  range.collapse(true)
  const selection = window.getSelection()
  if (!selection) throw new Error('no selection')
  selection.removeAllRanges()
  selection.addRange(range)
  return target
}

describe('pasteSlideRichText', () => {
  it('inserts sanitized html at the caret and reports that it handled the paste', () => {
    const target = targetWithCaret()
    expect(
      pasteSlideRichText(target, { html: '<b>mid</b><img src=x onerror=alert(1)>', text: null }),
    ).toBe(true)
    expect(target.innerHTML).toBe('<span id="lead">lead</span><b>mid</b><span id="tail">tail</span>')
    target.remove()
  })

  it('escapes a plain-text paste and keeps its line breaks', () => {
    const target = targetWithCaret()
    expect(pasteSlideRichText(target, { html: null, text: '<script>\nline' })).toBe(true)
    expect(target.innerHTML).toContain('&lt;script&gt;<br>line')
    target.remove()
  })
})

describe('pasteSlideRichText without a caret in the box', () => {
  it('appends at the end when the caret is not inside the box', () => {
    const target = document.createElement('div')
    target.innerHTML = 'text'
    document.body.append(target)
    window.getSelection()?.removeAllRanges()
    expect(pasteSlideRichText(target, { html: null, text: ' more' })).toBe(true)
    expect(target.textContent).toBe('text more')
    target.remove()
  })

  it('reports nothing to handle for an empty clipboard', () => {
    const target = document.createElement('div')
    document.body.append(target)
    expect(pasteSlideRichText(target, { html: '  ', text: null })).toBe(false)
    expect(pasteSlideRichText(target, { html: null, text: '' })).toBe(false)
    expect(target.innerHTML).toBe('')
    target.remove()
  })
})
