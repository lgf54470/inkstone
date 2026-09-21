/**
 * The channel behind P-01: a fence body no longer rides inside the markup as a `data-*` attribute, so
 * the only thing connecting a block to its body is the index the renderer wrote and the set the host
 * registered. Both halves are one function each, and a wrong answer here is a board that reads as
 * empty on every surface at once — which is why this module, not just its consumers, is under test.
 */
import { describe, expect, it } from 'vitest'
import {
  blockFenceBodies,
  cloneFenceBodies,
  createFenceBodies,
  fenceBody,
  findFenceBodies,
  registerFenceBodies,
  sameFenceBodies,
  takeFenceIndex,
} from './fence-bodies'

function nested(): { outer: HTMLElement, middle: HTMLElement, block: HTMLElement } {
  const outer = document.createElement('div')
  const middle = document.createElement('section')
  const block = document.createElement('div')
  middle.append(block)
  outer.append(middle)
  return { outer, middle, block }
}

function markup(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

// A rendered fence is its own top-level block, so a host compares the element that carries the
// number, not a wrapper standing around it.
function fenceBlock(html: string): HTMLElement {
  return markup(html).firstElementChild as HTMLElement
}

describe('takeFenceIndex', () => {
  it('returns the position its body will be read back from', () => {
    const bodies = createFenceBodies()
    const first = takeFenceIndex(bodies, 'kanban', '{"title":"One"}')
    const second = takeFenceIndex(bodies, 'kanban', '{"title":"Two"}')
    expect([first, second]).toEqual([0, 1])
    expect(bodies.kanban[first]).toBe('{"title":"One"}')
    expect(bodies.kanban[second]).toBe('{"title":"Two"}')
  })

  it('numbers each fence family on its own', () => {
    const bodies = createFenceBodies()
    takeFenceIndex(bodies, 'kanban', 'a board')
    expect(takeFenceIndex(bodies, 'mindmap', 'a map')).toBe(0)
    expect(bodies.mindmap[0]).toBe('a map')
  })
})

describe('fenceBody', () => {
  it('reads the body out of the nearest registered element above the block', () => {
    const { outer, middle, block } = nested()
    const bodies = createFenceBodies()
    const index = takeFenceIndex(bodies, 'kanban', 'the outer document')
    const inner = createFenceBodies()
    takeFenceIndex(inner, 'kanban', 'a subtree of its own')
    registerFenceBodies(outer, bodies)
    registerFenceBodies(middle, inner)
    // A nested render registers its own set, and the block under it reads that one: a set further up
    // would answer for a different numbering.
    expect(fenceBody(block, 'kanban', index)).toBe('a subtree of its own')
    expect(findFenceBodies(block)).toBe(inner)
  })

  it('reads a block nothing was registered for as an empty fence', () => {
    const { block } = nested()
    const bodies = createFenceBodies()
    const index = takeFenceIndex(bodies, 'kanban', 'a board its host never registered')
    expect(fenceBody(block, 'kanban', index)).toBe('')
    expect(findFenceBodies(block)).toBeNull()
  })

  it('reads an index the set does not hold as an empty fence, not as a neighbour body', () => {
    const { outer, block } = nested()
    const bodies = createFenceBodies()
    takeFenceIndex(bodies, 'kanban', 'the only board in this document')
    registerFenceBodies(outer, bodies)
    expect(fenceBody(block, 'kanban', 1)).toBe('')
    expect(fenceBody(block, 'mindmap', 0)).toBe('')
  })
})

describe('sameFenceBodies', () => {
  it('holds two renders with the same bodies to be the same document', () => {
    const current = createFenceBodies()
    takeFenceIndex(current, 'kanban', '{"title":"Roadmap"}')
    takeFenceIndex(current, 'mindmap', '- root')
    const next = cloneFenceBodies(current)
    expect(current).not.toBe(next)
    expect(sameFenceBodies(current, next)).toBe(true)
  })

  it('sees a fence-body edit the markup never showed', () => {
    // With the bodies out of the attributes an edited board leaves the rendered string identical, so
    // a host that skips work on an unchanged string skips it on the strength of this compare alone.
    const current = createFenceBodies()
    takeFenceIndex(current, 'kanban', '{"title":"Roadmap"}')
    const next = createFenceBodies()
    takeFenceIndex(next, 'kanban', '{"title":"Backlog"}')
    expect(sameFenceBodies(current, next)).toBe(false)
  })

  it('sees a body added, moved, or dropped', () => {
    const current = createFenceBodies()
    takeFenceIndex(current, 'kanban', 'first')
    takeFenceIndex(current, 'kanban', 'second')
    const longer = cloneFenceBodies(current)
    takeFenceIndex(longer, 'kanban', 'third')
    const reordered = createFenceBodies()
    takeFenceIndex(reordered, 'kanban', 'second')
    takeFenceIndex(reordered, 'kanban', 'first')
    expect(sameFenceBodies(current, longer)).toBe(false)
    expect(sameFenceBodies(current, reordered)).toBe(false)
    expect(sameFenceBodies(longer, current)).toBe(false)
  })
})

describe('blockFenceBodies', () => {
  it('reads the block that is itself a fence', () => {
    const bodies = createFenceBodies()
    takeFenceIndex(bodies, 'kanban', 'a board block')
    expect(blockFenceBodies(fenceBlock('<div data-kanban-index="0"></div>'), bodies)).toEqual(['a board block'])
  })

  it('reads a block and the blocks inside it, grouped by family', () => {
    const bodies = createFenceBodies()
    takeFenceIndex(bodies, 'kanban', 'a board')
    takeFenceIndex(bodies, 'mindmap', 'a map')
    // A map cannot outlive the board it was embedded in, so the two numbers belong to different
    // families and each family keeps its own numbering.
    expect(blockFenceBodies(markup('<div data-kanban-index="0"><div data-mindmap-index="0"></div></div>'), bodies))
      .toEqual(['a board', 'a map'])
  })

  it('reads the deck of a family whose attribute does not match its name', () => {
    const bodies = createFenceBodies()
    takeFenceIndex(bodies, 'slides', 'a deck')
    expect(blockFenceBodies(markup('<div data-bento-slides-index="0"></div>'), bodies)).toEqual(['a deck'])
  })
})

describe('blockFenceBodies with a number the set cannot answer', () => {
  it('reads a number the set does not hold as empty, not as the first body', () => {
    const bodies = createFenceBodies()
    takeFenceIndex(bodies, 'kanban', 'a board another block owns')
    expect(blockFenceBodies(markup('<div data-kanban-index="7"></div>'), bodies)).toEqual([''])
  })

  it('reads a block with no usable number the way its paint will', () => {
    // Each family's own accessor clamps an unreadable index to the first block, so this compare must
    // clamp identically — otherwise an edit that moves a corrupt block onto a real board looks like
    // nothing changed to the host that skips repaints on this list.
    const bodies = createFenceBodies()
    takeFenceIndex(bodies, 'kanban', 'the board a numberless block shows')
    expect(blockFenceBodies(markup('<div data-kanban-index="not a number"></div>'), bodies))
      .toEqual(['the board a numberless block shows'])
  })
})

describe('cloneFenceBodies', () => {
  it('continues numbering on the copy without touching what it came from', () => {
    const original = createFenceBodies()
    takeFenceIndex(original, 'slides', 'a deck')
    const copy = cloneFenceBodies(original)
    takeFenceIndex(copy, 'slides', 'an embed resolved into this document')
    expect(original.slides).toEqual(['a deck'])
    expect(copy.slides).toEqual(['a deck', 'an embed resolved into this document'])
  })
})
