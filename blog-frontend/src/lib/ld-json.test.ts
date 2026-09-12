import { describe, expect, it } from 'vitest'

import { serializeLdJson } from './ld-json'

describe('serializeLdJson', () => {
  it('escapes < so closing script tags inside content cannot break out', () => {
    const json = serializeLdJson({ headline: '</script><script>alert(1)</script>' })
    expect(json).not.toContain('</script>')
    expect(json).toContain('\\u003c/script>')
    expect(JSON.parse(json)).toEqual({ headline: '</script><script>alert(1)</script>' })
  })

  it('keeps regular JSON output intact', () => {
    expect(serializeLdJson({ '@type': 'BlogPosting', title: '笔记 <手记>' })).toBe(
      '{"@type":"BlogPosting","title":"笔记 \\u003c手记>"}'
    )
  })
})
