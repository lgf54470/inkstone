import type { ShareCollection } from '@shared/types'

/**
 * A collection's public address, built in one place: the panel copies it, the QR sheet would show it,
 * and the visitor-facing directory links back to it. A second builder would be a second answer to
 * "where does this page live".
 */
export function collectionPath(slug: string): string {
  return `/c/${slug}`
}

export function collectionShareUrl(slug: string): string {
  return `${window.location.origin}${collectionPath(slug)}`
}

/**
 * How a collection describes what it holds. The target's own name is the title; this is the label for
 * the *kind*, which is what tells the owner whether a link came from a folder they reorganised or a
 * tag they added later.
 */
export function collectionTargetKey(
  collection: Pick<ShareCollection, 'targetType'>,
): 'share.collection_target_folder' | 'share.collection_target_tag' {
  return collection.targetType === 'folder' ? 'share.collection_target_folder' : 'share.collection_target_tag'
}
