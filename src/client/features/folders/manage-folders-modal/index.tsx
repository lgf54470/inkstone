import type { Folder } from '@shared/types'
import { Modal } from '../../../components/overlay'
import { openFolderView } from '../../../lib/folders'
import { setInboxFolderId } from '../../../lib/folder-prefs'
import { FolderTemplateModal } from '../folder-template-modal'
import { t } from '../../../lib/i18n'
import type { NotesState } from '../../../store/notes'
import { useManageFoldersModal } from './use-manage-folders-modal'
import { FolderControlsBar, FolderCreateForm, FolderRowList, type FolderRowActions, type ToastFn } from './sections'

const MODAL_WIDTH = 640

function buildFolderRowActions(api: {
  folders: Parameters<typeof openFolderView>[0]
  inboxFolderId: string | null
  iconPickerFolderId: string | null
  colorPickerFolderId: string | null
  patchFolder: (id: string, patch: Parameters<NotesState['patchFolder']>[1]) => unknown
  toast: ToastFn
  onClose: () => void
  setIconPickerFolderId: (value: string | null | ((cur: string | null) => string | null)) => void
  setColorPickerFolderId: (value: string | null | ((cur: string | null) => string | null)) => void
  setInboxFolderId: (value: string | null) => void
  setRenamingId: (value: string | null) => void
  setRenameValue: (value: string) => void
  setTemplateFolder: (value: Folder | null) => void
  handleSaveRename: (id: string) => void
  handleDelete: (folder: Folder) => void
}): FolderRowActions {
  return {
    isIconPickerOpen: (folder) => api.iconPickerFolderId === folder.id,
    isColorPickerOpen: (folder) => api.colorPickerFolderId === folder.id,
    onToggleIconPicker: (id) => {
      api.setIconPickerFolderId((cur) => (cur === id ? null : id))
      api.setColorPickerFolderId(null)
    },
    onToggleColorPicker: (id) => {
      api.setColorPickerFolderId((cur) => (cur === id ? null : id))
      api.setIconPickerFolderId(null)
    },
    onStartRename: (folder) => {
      api.setRenamingId(folder.id)
      api.setRenameValue(folder.name)
    },
    onRenameChange: api.setRenameValue,
    onSaveRename: api.handleSaveRename,
    onCancelRename: () => api.setRenamingId(null),
    onToggleInbox: (folder) => {
      if (api.inboxFolderId === folder.id) {
        api.setInboxFolderId(null)
        api.toast({ title: t('folders.inbox_cleared_toast'), tone: 'default' })
      } else {
        api.setInboxFolderId(folder.id)
        api.toast({ title: t('folders.inbox_set_toast', { value0: folder.name }), tone: 'success' })
      }
    },
    onOpen: (folder) => {
      openFolderView(api.folders, folder.id)
      api.onClose()
    },
    onBindTemplate: api.setTemplateFolder,
    onDelete: api.handleDelete,
    onPickColor: (id, color) => {
      api.patchFolder(id, { color })
      api.setColorPickerFolderId(null)
    },
    onPickIcon: (id, icon) => {
      api.patchFolder(id, { icon })
      api.setIconPickerFolderId(null)
    },
    toast: api.toast,
  }
}

export function ManageFoldersModal({ onClose }: { onClose: () => void }) {
  const { folders, patchFolder, folderCounts, toast, inboxFolderId, folderTemplates, templates, query, setQuery, isCreating, setIsCreating, newFolderName, setNewFolderName, renamingId, setRenamingId, renameValue, setRenameValue, colorPickerFolderId, setColorPickerFolderId, iconPickerFolderId, setIconPickerFolderId, templateFolder, setTemplateFolder, choices, emptyFolders, handleCleanEmpty, handleCreate, handleSaveRename, handleDelete } = useManageFoldersModal()

  const actions = buildFolderRowActions({
    folders, patchFolder, toast, inboxFolderId, iconPickerFolderId, colorPickerFolderId,
    setIconPickerFolderId, setColorPickerFolderId, setInboxFolderId, setRenamingId, setRenameValue, setTemplateFolder,
    handleSaveRename, handleDelete, onClose,
  })

  return (
    <>
      <Modal open onClose={onClose} title={t('folders.manage_folders')} description={t('folders.manage_description')} width={MODAL_WIDTH}>
        <div className='space-y-3 pt-1'>
          <FolderControlsBar query={query} onQueryChange={setQuery} emptyFolders={emptyFolders} isCreating={isCreating} onClean={handleCleanEmpty} onAdd={() => { setIsCreating(true); setNewFolderName(''); }} />
          {isCreating && <FolderCreateForm value={newFolderName} onChange={setNewFolderName} onSubmit={handleCreate} onCancel={() => setIsCreating(false)} />}
          <FolderRowList choices={choices} folderCounts={folderCounts} folderTemplates={folderTemplates} templates={templates} renamingId={renamingId} inboxFolderId={inboxFolderId} colorPickerFolderId={colorPickerFolderId} iconPickerFolderId={iconPickerFolderId} renameValue={renameValue} query={query} actions={actions} />
        </div>
      </Modal>
      {templateFolder && <FolderTemplateModal folder={templateFolder} onClose={() => setTemplateFolder(null)} />}
    </>
  )
}