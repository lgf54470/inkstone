import { describe, expect, it } from 'vitest'
import { MINDMAP_NODE_TEXT_RULE, classifyIncomplete } from '../scripts/lib/axe-review.mjs'
import { isReviewedIncomplete } from '../scripts/e2e-harness.mjs'

/**
 * The contrast gate sets aside exactly one axe item per theme — the mind map's own node text, which
 * axe reports as `bgOverlap` because the vendored map ranks its positioned node wrapper above the
 * text it holds — and the browser gate's own log is the only place that rule used to live. A rule
 * that silences more than it names is how a gate stops asking questions, so the classifier and the
 * rule are pinned here: each part of the triple has to be load-bearing, and the failure path has to
 * stay a failure.
 *
 * The target below is the one the gate reads on the running app (run of 2026-09-23), with the node id
 * kept as axe reports it.
 */

const mindmapNodeText = (overrides: Record<string, unknown> = {}) => ({
  id: 'color-contrast',
  key: 'bgOverlap',
  count: 2,
  target: 'me-tpc[data-nodeid="me0ca17e73465a9545"] > .text',
  note: "Fix any of the following: Element's background color could not be determined because it is overlapped by another element",
  ...overrides,
})

const classify = (incomplete: unknown[]) =>
  classifyIncomplete({
    incomplete: incomplete as Parameters<typeof classifyIncomplete>[0]['incomplete'],
    declared: [MINDMAP_NODE_TEXT_RULE],
    isReviewedIncomplete,
  })

describe('the mind map node text allowance', () => {
  it('sets aside the item the gate reads on the running instance and fails nothing', () => {
    const { named, review, allowed } = classify([mindmapNodeText()])
    expect(review).toEqual([])
    expect(allowed).toBe(1)
    expect(named).toHaveLength(1)
    expect(named[0].rule).toBe(MINDMAP_NODE_TEXT_RULE)
  })

  it('holds the rule to the id, axe key and target together, not to any one of them', () => {
    const drifted = [
      mindmapNodeText({ id: 'color-contrast-enhanced' }),
      mindmapNodeText({ key: 'elmPartiallyObscuring' }),
      mindmapNodeText({ key: '' }),
      // A text the panel draws itself, one the map does not wrap that way, and a descendant of a node
      // text all have to stay review items.
      mindmapNodeText({ target: '.mindmap-shortcuts > ul > li' }),
      mindmapNodeText({ target: 'me-tpc[x] > .text' }),
      mindmapNodeText({ target: 'me-tpc[data-nodeid="me1"] > .text > b' }),
      mindmapNodeText({ target: 'div.me-tpc[data-nodeid="me1"] > .text' }),
    ]
    const { named, review, allowed } = classify(drifted)
    expect(named).toEqual([])
    expect(allowed).toBe(0)
    expect(review).toHaveLength(drifted.length)
  })

  it('counts the gate\u2019s own global categories as allowed and keeps them out of the rule', () => {
    const { named, review, allowed } = classify([
      mindmapNodeText(),
      { id: 'aria-hidden-focus', key: '', count: 3, target: 'div[aria-hidden="true"]', note: '' },
      { id: 'color-contrast', key: '', count: 1, target: 'span', note: 'text is too short to determine' },
    ])
    expect(named).toHaveLength(1)
    expect(allowed).toBe(3)
    expect(review).toEqual([])
  })

  it('fails an item the rule does not cover, even when axe’s wording is the same', () => {
    // Same id and same prose as the item the rule sets aside, a different target: axe's message is
    // what a reader sees in the log, never what decides the outcome.
    const unknown = mindmapNodeText({ target: 'section.mindmap-shortcuts', count: 1 })
    // Neither of the gate's global categories covers it either, so nothing rescues a drifted target.
    const partially = { id: 'color-contrast', key: 'elmPartiallyObscuring', count: 1, target: 'me-tpc[data-nodeid="me1"] > .text', note: 'Element has insufficient colour contrast' }
    const { named, review, allowed } = classify([unknown, partially])
    expect(named).toEqual([])
    expect(allowed).toBe(0)
    expect(review).toEqual([unknown, partially])
  })
})
