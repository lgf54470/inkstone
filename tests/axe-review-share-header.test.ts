import { describe, expect, it } from 'vitest'
import { SHARE_TABLE_HEADER_RULE, classifyIncomplete } from '../scripts/lib/axe-review.mjs'
import { isReviewedIncomplete } from '../scripts/e2e-harness.mjs'

/**
 * FB-C5: the gate's second named allowance, and the first one that is not about a colour at all. At
 * phone width the share center's table is 940px wide inside a 390px viewport, and axe's own
 * `color-contrast` gives up on the header cell it puts down first — the rule throws ("Element
 * midpoint exceeds the grid bounds"), axe files that under its `error-occurred` check, and the
 * surface is left unjudged for that node rather than judged. The item below is the one the gate reads
 * on the running instance (390×844, run of 2026-09-27); the harness exposes that check's id as the
 * item's `key`, which is what the rule matches — axe's prose is only what a reader sees in the log.
 *
 * Both directions are pinned here for the same reason the mind map's rule is: a named allowance must
 * not be wider than what it names. A *judged* item on the very same cell still fails the gate, an
 * item with no key is not this rule, and a rule error anywhere else in the surface is still reviewed.
 */

const shareHeaderRuleError = (overrides: Record<string, unknown> = {}) => ({
  id: 'color-contrast',
  key: 'error-occurred',
  count: 1,
  target: 'th:nth-child(2)',
  note: 'Fix all of the following: Axe encountered an error; test the page for this type of problem manually',
  ...overrides,
})

const classify = (incomplete: unknown[]) =>
  classifyIncomplete({
    incomplete: incomplete as Parameters<typeof classifyIncomplete>[0]['incomplete'],
    declared: [SHARE_TABLE_HEADER_RULE],
    isReviewedIncomplete,
  })

describe('the share table header allowance', () => {
  it('sets aside the rule error the gate reads at phone width', () => {
    const { named, review, allowed } = classify([shareHeaderRuleError()])
    expect(review).toEqual([])
    expect(allowed).toBe(1)
    expect(named).toHaveLength(1)
    expect(named[0].rule).toBe(SHARE_TABLE_HEADER_RULE)
  })

  it('takes a header cell by its shape, another column included', () => {
    const { review, allowed } = classify([
      shareHeaderRuleError({ target: 'th:nth-child(5)' }),
      shareHeaderRuleError({ target: 'th' }),
    ])
    expect(review).toEqual([])
    expect(allowed).toBe(2)
  })

  it('holds the rule to the id, the error key and the target together', () => {
    const drifted = [
      // A judgement, not an error: the same cell, measured and found wanting.
      shareHeaderRuleError({ key: 'shortTextContent' }),
      shareHeaderRuleError({ key: 'bgOverlap' }),
      // axe's wording on the rule's own cell, but filed under no key at all.
      shareHeaderRuleError({ key: '' }),
      shareHeaderRuleError({ id: 'color-contrast-enhanced' }),
      // A rule error on any other node in the surface is still reviewed.
      shareHeaderRuleError({ target: 'td:nth-child(2)' }),
      shareHeaderRuleError({ target: 'div.grid-cols-2 > button' }),
      shareHeaderRuleError({ target: 'thead > tr > th:nth-child(2)' }),
    ]
    const { named, review, allowed } = classify(drifted)
    expect(named).toEqual([])
    expect(allowed).toBe(0)
    expect(review).toHaveLength(drifted.length)
  })
})
