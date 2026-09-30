import { describe, expect, it } from 'vitest'
import { redirectTargetFor } from '../src/lib/post-redirect'

/** 旧地址要不要 301：服务端说得出一个不同的当前地址才跳，其余情况一律保持 404。 */
describe('retired slug redirect', () => {
  it('sends a retired address to the post current one', () => {
    expect(redirectTargetFor('old-name', 'new-name')).toBe('/posts/new-name')
  })

  it('keeps the request a 404 when nothing owns the address', () => {
    expect(redirectTargetFor('never-used', null)).toBeNull()
    expect(redirectTargetFor('never-used', undefined)).toBeNull()
    expect(redirectTargetFor('never-used', '')).toBeNull()
  })

  it('does not bounce a request that is already at the current address', () => {
    expect(redirectTargetFor('current-name', 'current-name')).toBeNull()
  })
})
