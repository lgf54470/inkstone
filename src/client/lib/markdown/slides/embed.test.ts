import { describe, expect, it } from 'vitest'
import { embedUrl, embedUrlIsSafe, embedViewIsInline } from './embed'

describe('embedViewIsInline', () => {
  it('draws markup the file carries', () => {
    expect(embedViewIsInline('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBe(true)
    expect(embedViewIsInline('  <div class="x">hi</div>')).toBe(true)
    expect(embedViewIsInline('<figure><img src="data:image/png;base64,AAA"></figure>')).toBe(true)
  })

  it('does not draw an address, an empty view or something that is not markup', () => {
    expect(embedViewIsInline('https://bento.page/dash/')).toBe(false)
    expect(embedViewIsInline('')).toBe(false)
    expect(embedViewIsInline(undefined)).toBe(false)
    expect(embedViewIsInline('just text')).toBe(false)
    expect(embedViewIsInline('<script>alert(1)</script>')).toBe(false)
  })
})

describe('embedUrlIsSafe', () => {
  it('allows a web address or a path inside the app', () => {
    expect(embedUrlIsSafe('https://bento.page/dash/')).toBe(true)
    expect(embedUrlIsSafe('http://localhost:7712/x')).toBe(true)
    expect(embedUrlIsSafe('//bento.page/dash/')).toBe(true)
    expect(embedUrlIsSafe('/dash/board')).toBe(true)
  })

  it('refuses data URIs and non-web schemes', () => {
    expect(embedUrlIsSafe('javascript:alert(1)')).toBe(false)
    expect(embedUrlIsSafe('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(embedUrlIsSafe('file:///etc/passwd')).toBe(false)
    expect(embedUrlIsSafe('')).toBe(false)
    expect(embedUrlIsSafe(undefined)).toBe(false)
  })
})

describe('embedUrl', () => {
  it('answers the address to offer, trimmed, and nothing for an unsafe one', () => {
    expect(embedUrl(' https://bento.page/dash/ ')).toBe('https://bento.page/dash/')
    expect(embedUrl('javascript:alert(1)')).toBe('')
    expect(embedUrl(undefined)).toBe('')
  })
})
