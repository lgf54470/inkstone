import type { Tag } from '@shared/types'
import { confirm } from '../../components/overlay'
import { useNotes } from '../../store/notes'
import { useUi } from '../../store/ui'
import { t } from '../../lib/i18n'
import { createTag, deleteTag, renameTag, setTagColor, toggleTagPinned } from './tag-mutations'
import { TagManagerModal } from './tag-manager-modal'
import type { TagManagerController } from './tag-manager-controller'

export function ManageTagsModal({ onClose }: { onClose: () => void }) {
  const tags = useNotes((state) => state.tags ?? [])
  return <TagManagerModal controller={notesTagManager(tags, onClose)} onClose={onClose} />
}

function notesTagManager(tags: Tag[], onClose: () => void): TagManagerController {
  return {
    tags,
    create: (name) => createTag(name),
    rename: (tag, name) => void renameTag(tag, name),
    setColor: (tag, color) => void setTagColor(tag, color),
    togglePin: (tag) => void toggleTagPinned(tag),
    remove: (tag) => void deleteTag(tag),
    merge: (source, target) => void renameTag(source, target.name),
    openTag: (name) => {
      useUi.getState().openView('tag', { tag: name })
      onClose()
    },
    removeUnused: (tags) => void cleanUnusedTags(tags),
  }
}

async function cleanUnusedTags(unusedTags: Tag[]): Promise<void> {
  if (!unusedTags.length) return
  const ok = await confirm({
    title: t('tags.clean_unused'),
    description: t('tags.clean_unused_confirm_value0', { value0: unusedTags.length }),
    tone: 'danger',
    confirmLabel: t('common.delete'),
  })
  if (!ok) return
  for (const tag of unusedTags) deleteTag(tag)
}
