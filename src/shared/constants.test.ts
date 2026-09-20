import { describe, expect, it } from 'vitest'
import { LIMITS } from './constants'

describe('LIMITS', () => {
  it('keeps the tag selection cap at 20 so the UI, graph, and MCP filters stay consistent', () => {
    expect(LIMITS.tagSelectionMax).toBe(20)
  })
})
