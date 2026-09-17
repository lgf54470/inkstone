import { describe, expect, it } from 'vitest'
import { moveItem, moveSlide, reorderElement, reorderSlide } from './order'

const items = (...ids: string[]) => ids.map((id) => ({ id }))
const ids = (list: { id: string }[]) => list.map((item) => item.id)

describe('moveItem', () => {
  it('takes the target slot, closing the gap behind it', () => {
    expect(ids(moveItem(items('a', 'b', 'c', 'd'), 0, 2))).toEqual(['b', 'c', 'a', 'd'])
    expect(ids(moveItem(items('a', 'b', 'c', 'd'), 3, 0))).toEqual(['d', 'a', 'b', 'c'])
    expect(ids(moveItem(items('a', 'b', 'c', 'd'), 1, 2))).toEqual(['a', 'c', 'b', 'd'])
  })

  it('is a no-op when the move says nothing, or the source is not in the list', () => {
    const list = items('a', 'b')
    expect(moveItem(list, 1, 1)).toBe(list)
    expect(moveItem(list, 5, 0)).toBe(list)
    expect(moveItem(list, -1, 0)).toBe(list)
  })

  it('clamps a target past the end instead of dropping the item', () => {
    expect(ids(moveItem(items('a', 'b', 'c'), 0, 9))).toEqual(['b', 'c', 'a'])
  })
})

describe('moveSlide', () => {
  it('moves a page a step and reports where it landed', () => {
    const moved = moveSlide(items('a', 'b', 'c'), 'b', 'down')
    expect(ids(moved!.slides)).toEqual(['a', 'c', 'b'])
    expect(moved!.index).toBe(2)
  })

  it('refuses to move past either end', () => {
    expect(moveSlide(items('a', 'b'), 'a', 'up')).toBeNull()
    expect(moveSlide(items('a', 'b'), 'b', 'down')).toBeNull()
    expect(moveSlide(items('a', 'b'), 'missing', 'up')).toBeNull()
  })
})

describe('reorderSlide', () => {
  it('drops a page onto the slot of the one it was dropped on', () => {
    expect(ids(reorderSlide(items('a', 'b', 'c'), 'c', 'a')!)).toEqual(['c', 'a', 'b'])
    expect(ids(reorderSlide(items('a', 'b', 'c'), 'a', 'c')!)).toEqual(['b', 'c', 'a'])
  })

  it('does nothing for an unknown page or a drop on itself', () => {
    expect(reorderSlide(items('a', 'b'), 'a', 'a')).toBeNull()
    expect(reorderSlide(items('a', 'b'), 'a', 'z')).toBeNull()
  })
})

describe('reorderElement', () => {
  it('reads up as toward the top of the stack, and front as the end of the array', () => {
    expect(ids(reorderElement(items('back', 'mid', 'top'), 'mid', 'up')!)).toEqual(['back', 'top', 'mid'])
    expect(ids(reorderElement(items('back', 'mid', 'top'), 'top', 'down')!)).toEqual(['back', 'top', 'mid'])
    expect(ids(reorderElement(items('back', 'mid', 'top'), 'back', 'front')!)).toEqual(['mid', 'top', 'back'])
    expect(ids(reorderElement(items('back', 'mid', 'top'), 'top', 'back')!)).toEqual(['top', 'back', 'mid'])
  })

  it('does nothing when the element is already there or absent', () => {
    expect(reorderElement(items('a', 'b'), 'b', 'front')).toBeNull()
    expect(reorderElement(items('a', 'b'), 'a', 'back')).toBeNull()
    expect(reorderElement(items('a', 'b'), 'b', 'up')).toBeNull()
    expect(reorderElement(items('a', 'b'), 'missing', 'front')).toBeNull()
  })
})
