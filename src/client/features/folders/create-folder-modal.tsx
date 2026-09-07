import { useState } from 'react'
import { Modal } from '../../components/overlay'
import { Button } from '../../components/primitives'
import { useNotes } from '../../store/notes'
import { t } from '../../lib/i18n'

const MODAL_WIDTH = 400

function FolderNameField({ name, onNameChange }: { name: string; onNameChange: (name: string) => void }) {
  return (
    <label className='block'>
      <input
        autoFocus
        type='text'
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder={t('common.new_folder')}
        className='h-10 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] px-3 text-[length:var(--text-13)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:shadow-[var(--shadow-focus)]'
      />
    </label>
  )
}

function CreateFolderFooter({
  canSubmit,
  onCancel,
}: {
  canSubmit: boolean
  onCancel: () => void
}) {
  return (
    <>
      <Button variant='ghost' type='button' onClick={onCancel}>
        {t('common.cancel')}
      </Button>
      <Button variant='primary' type='submit' form='create-folder-modal-form' disabled={!canSubmit} data-autofocus>
        {t('folders.create_new')}
      </Button>
    </>
  )
}

export function CreateFolderModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated?: (folderId: string) => void
}) {
  const [name, setName] = useState('')
  const createFolder = useNotes((s) => s.createFolder)

  const closeAndReset = () => {
    setName('')
    onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const folderId = createFolder({ name: trimmed })
    if (folderId && onCreated) {
      onCreated(folderId)
    }
    setName('')
    onClose()
  }

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={closeAndReset}
      title={t('common.new_folder')}
      description={t('folders.create_and_move_desc')}
      width={MODAL_WIDTH}
      footer={<CreateFolderFooter canSubmit={Boolean(name.trim())} onCancel={closeAndReset} />}
    >
      <form id='create-folder-modal-form' onSubmit={handleSubmit} className='pt-1'>
        <FolderNameField name={name} onNameChange={setName} />
      </form>
    </Modal>
  )
}
