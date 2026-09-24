import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateRandomSlug } from './share-helpers'

const CHARSET = '23456789abcdefghjkmnpqrstvwxyz'

beforeEach(() => {
  vi.spyOn(Math, 'random')
})

afterEach(() => {
  vi.restoreAllMocks()
})

function stubBytes(...batches: number[][]): void {
  let call = 0
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array: ArrayBufferView) => {
    const bytes = array as Uint8Array
    const batch = batches[Math.min(call, batches.length - 1)]
    bytes.set(batch.slice(0, bytes.length).map((byte) => byte % 256))
    call += 1
    return array
  })
}

describe('random slug suggestion (audit #3)', () => {
  it('draws from crypto, not from Math.random', () => {
    const cryptoSpy = vi.spyOn(globalThis.crypto, 'getRandomValues')
    generateRandomSlug()
    expect(cryptoSpy).toHaveBeenCalled()
    expect(Math.random).not.toHaveBeenCalled()
  })

  it('stays inside the charset and the asked length over many draws', () => {
    for (let i = 0; i < 200; i += 1) {
      const slug = generateRandomSlug(6)
      expect(slug).toHaveLength(6)
      for (const char of slug) expect(CHARSET).toContain(char)
    }
  })

  it('maps bytes without modulo bias and rejects the tail', () => {
    // 0 → '2', 29 → 'z', 239 accepted (239 % 30 = 29 → 'z'), 240 must be rejected;
    // a second batch of 1s fills the rest → '3'.
    stubBytes([0, 29, 239, 240, 250, 255], [1, 1, 1, 1, 1, 1])
    expect(generateRandomSlug(5)).toBe('2zz33')
  })

  it('keeps drawing when one batch rejects too much to fill the slug', () => {
    stubBytes([255, 255, 255, 255, 255, 255], [7, 8, 9, 10, 11, 12])
    expect(generateRandomSlug(4)).toBe([7, 8, 9, 10].map((index) => CHARSET[index]).join(''))
  })
})
