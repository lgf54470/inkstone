import { describe, expect, it } from 'vitest'
import { collectionChannelToken, normalizeChannelToken } from '@shared/share-channel'
import { collectionNoteLink } from './share-collections'

/**
 * ADR-0005 phase 3, per collection (SH-67's channel): a visit from a directory is attributed to the
 * collection it came from, which is only possible if the marker names that one collection. The same
 * assertion runs on the visit writer's charset in `share-channel.test.ts`; here it is the link the
 * visitor actually clicks, because that is the only place the marker is minted for a real reader.
 */
describe('collection directory links (ADR-0005)', () => {
  it('marks every directory entry with the collection it came from', () => {
    const slug = '0123456789abcdefghjk'
    const token = collectionChannelToken(slug)

    const link = collectionNoteLink('note-slug', slug)

    expect(link).toBe(`/s/note-slug?ref=${token}`)
    // A marker the visit writer refuses would still produce a row, logged as a refusal — which the
    // dashboard reports as \"the owner mistyped a URL\". The link must not be able to do that.
    expect(normalizeChannelToken(token)).toBe(token)
  })
})
