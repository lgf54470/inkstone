import { TagManagerModal } from '../tags'
import type { TagManagerController } from '../tags'
import { t } from '../../lib/i18n'
import { useMusic, useTagCounts } from './music-store'
import { leafTagName, toTagRows } from './music-tag-rows'
import { MUSIC_TAG_COLORS } from './music-utils'

export function MusicTagManagerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tags = useMusic((state) => state.tags)
  const createTag = useMusic((state) => state.createTag)
  const patchTag = useMusic((state) => state.patchTag)
  const deleteTag = useMusic((state) => state.deleteTag)
  const counts = useTagCounts()
  if (!open) return null
  const controller: TagManagerController = {
    tags: toTagRows(tags, counts),
    create: (name) => void createTag(name, MUSIC_TAG_COLORS[0]?.value ?? null),
    rename: (tag, value) => void patchTag(tag.id, { name: leafTagName(value) }),
    setColor: (tag, color) => void patchTag(tag.id, { color }),
    togglePin: (tag) => void patchTag(tag.id, { isPinned: !tag.isPinned }),
    remove: (tag) => void deleteTag(tag.id),
    labels: { count: (count) => t('music.playlist_track_count', { value0: count }) },
  }
  return <TagManagerModal controller={controller} onClose={onClose} />
}
