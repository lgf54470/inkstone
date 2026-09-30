import { describe, expect, it } from 'vitest'
import { slugSaveNotice } from './use-blog-publish-form'

/**
 * The dialog's save guard, read without the note, the store or the network. The locale is not
 * loaded in this harness, so the message ids the function returns are what gets asserted.
 */
describe('publish save guard', () => {
  it('stops a save whose slug the checker already called taken', () => {
    expect(slugSaveNotice('taken-slug', false, 'blog.slug_taken')).toBe('blog.slug_taken')
  })

  it('asks for a slug when the field holds nothing', () => {
    expect(slugSaveNotice('   ', null, '')).toBe('blog.slug_hint')
  })

  it('lets the save through while the answer is unknown or positive', () => {
    expect(slugSaveNotice('fresh-slug', null, '')).toBeNull()
    expect(slugSaveNotice('fresh-slug', true, '')).toBeNull()
  })

  it('falls back to the generic hint when an unavailable slug arrives without a reason', () => {
    expect(slugSaveNotice('taken-slug', false, '')).toBe('blog.slug_hint')
  })
})
