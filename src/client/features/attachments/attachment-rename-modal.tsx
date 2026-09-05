import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Modal } from '../../components/overlay'
import { Button } from '../../components/primitives'
import { Checkbox, Input } from '../../components/form'
import { t } from '../../lib/i18n'

export function AttachmentRenameModal({
  open,
  onClose,
  currentFilename,
  onRename,
}: {
  open: boolean
  onClose: () => void
  currentFilename: string
  onRename: (newFilename: string, updateNoteReferences: boolean) => Promise<void>
}) {
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
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        <label className="block space-y-1.5">
          <span className="text-[12px] font-medium text-[var(--text-secondary)]">
            {t('attachments.filename')}
          </span>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSaving}
          />
        </label>

        <label className="flex items-center gap-2.5 cursor-pointer text-[12.5px] text-[var(--text-secondary)] select-none">
          <Checkbox
            checked={isUpdateRefs}
            onChange={(checked) => setIsUpdateRefs(checked)}
          />
          <span>{t('attachments.sync_note_references')}</span>
        </label>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={!name.trim() || isSaving}
          >
            {isSaving ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
