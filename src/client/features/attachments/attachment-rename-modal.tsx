import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Modal } from '../../components/overlay'
import { Button } from '../../components/primitives'
import { Checkbox, Input } from '../../components/form'
import { t } from '../../lib/i18n'


interface AttachmentRenameModalProps {
  open: boolean
  onClose: () => void
  currentFilename: string
  onRename: (newFilename: string, updateNoteReferences: boolean) => Promise<void>
}

export function AttachmentRenameModal(props: AttachmentRenameModalProps) {
  const { open, onClose, currentFilename, onRename } = props
  const form = useRenameForm(open, currentFilename, onRename, onClose)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Pencil size={15} className="text-[var(--accent)]" />
          <span>{t('attachments.rename')}</span>
        </div>
      }
      width={440}
    >
      <form onSubmit={form.handleSubmit} className="space-y-4 pt-1">
        <label className="block space-y-1.5">
          <span className="text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]">
            {t('attachments.filename')}
          </span>
          <Input autoFocus value={form.name} onChange={(e) => form.setName(e.target.value)} disabled={form.isSaving} />
        </label>

        <label className="flex items-center gap-2.5 cursor-pointer text-[length:var(--text-12\\.5)] text-[var(--text-secondary)] select-none">
          <Checkbox checked={form.isUpdateRefs} onChange={(checked) => form.setIsUpdateRefs(checked)} />
          <span>{t('attachments.sync_note_references')}</span>
        </label>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={form.isSaving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={!form.name.trim() || form.isSaving}>
            {form.isSaving ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function useRenameForm(
  open: boolean,
  currentFilename: string,
  onRename: (newFilename: string, updateNoteReferences: boolean) => Promise<void>,
  onClose: () => void,
) {
  const [name, setName] = useState(currentFilename)
  const [isUpdateRefs, setIsUpdateRefs] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setName(currentFilename)
    setIsUpdateRefs(true)
  }, [currentFilename, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed === currentFilename) {
      onClose()
      return
    }
    setIsSaving(true)
    try {
      await onRename(trimmed, isUpdateRefs)
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return { name, setName, isUpdateRefs, setIsUpdateRefs, isSaving, handleSubmit }
}