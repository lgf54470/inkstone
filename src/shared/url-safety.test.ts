import { describe, expect, it } from 'vitest'
import { isSafeExternalUrl, safeExternalUrl } from './url-safety'

describe('external URL allowlist', () => {
  it('allows http and https links and a mailto address', () => {
    expect(isSafeExternalUrl('https://example.com/a?b=1#c')).toBe(true)
    expect(isSafeExternalUrl('http://example.com')).toBe(true)
    expect(isSafeExternalUrl('HTTPS://EXAMPLE.COM')).toBe(true)
    expect(isSafeExternalUrl('mailto:reader@example.com')).toBe(true)
  })

  it('allows site-relative paths, queries and fragments', () => {
    expect(isSafeExternalUrl('/posts/hello')).toBe(true)
    expect(isSafeExternalUrl('./cover.png')).toBe(true)
    expect(isSafeExternalUrl('#section')).toBe(true)
    expect(isSafeExternalUrl('posts/hello')).toBe(true)
  })

  it('keeps mailto out of image sources', () => {
    expect(isSafeExternalUrl('mailto:reader@example.com', 'image')).toBe(false)
    expect(isSafeExternalUrl('https://example.com/a.png', 'image')).toBe(true)
  })
})

describe('external URL refusals', () => {
  it('refuses the schemes that make a URL executable or a document', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('JavaScript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('vbscript:msgbox(1)')).toBe(false)
    expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeExternalUrl('data:image/svg+xml,<svg onload=alert(1)>')).toBe(false)
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeExternalUrl('blob:https://example.com/x')).toBe(false)
  })

  it('refuses a scheme smuggled behind control characters or a newline', () => {
    expect(isSafeExternalUrl('java\tscript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('java\nscript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl(' javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('\u0000javascript:alert(1)')).toBe(false)
  })

  it('refuses a protocol-relative host, which names a host but no scheme', () => {
    expect(isSafeExternalUrl('//evil.example/x')).toBe(false)
  })

  it('refuses an empty value', () => {
    expect(isSafeExternalUrl('')).toBe(false)
    expect(isSafeExternalUrl('   ')).toBe(false)
    expect(isSafeExternalUrl(null)).toBe(false)
    expect(isSafeExternalUrl(undefined)).toBe(false)
  })

  it('returns the trimmed value only when it may be used', () => {
    expect(safeExternalUrl('  https://example.com  ')).toBe('https://example.com')
    expect(safeExternalUrl('/posts/hello')).toBe('/posts/hello')
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(safeExternalUrl('')).toBeNull()
    expect(safeExternalUrl(undefined)).toBeNull()
  })
})
