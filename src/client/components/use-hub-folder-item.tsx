import { useEffect, useRef, useState } from 'react'
import { FolderPlus, Palette, PauseCircle, Pencil, PlayCircle, Trash2 } from 'lucide-react'
import { t } from '../lib/i18n'
import { tryParseStringArray } from '../lib/json'
import { useUi, type UiState } from '../store/ui'
import { useContextMenu, type MenuItem } from './overlay'
import { FolderColorSubmenu } from '../features/folders'
// FolderRowProps/FolderRowHandlers live here (not in hub-folder-row.tsx)
// because use-hub-folder-item.tsx consumed them; the row component already
// imports the other shared types from this module, so owning the props here
// keeps the pair free of an import cycle.

interface FolderRowHandlers {
  onToggleExpand: (e: React.MouseEvent) => void
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onNameChange: (value: string) => void
  onFinishRename: (nextName: string) => void
  onBatchToggle: (enabled: boolean) => void
  onToggleMenu: () => void
  onEmptyToast: () => void
}

export interface FolderRowProps {
  node: HubFolderNodeLike
  isExpanded: boolean
  isSelected: boolean
  isRenaming: boolean
  isDragOver: boolean
  batchBusy: boolean
  labels: HubFolderLabels
  counts: { safeTotal: number; safeEnabled: number; isChecked: boolean }
  nameInput: string
  refs: { inputRef: React.RefObject<HTMLInputElement | null>; moreButtonRef: React.RefObject<HTMLButtonElement | null> }
  handlers: FolderRowHandlers
}

export interface HubFolderNodeLike {
  folder: { id: string; name: string; color?: string | null }
  depth: number
  children: unknown[]
}

export interface HubFolderLabels {
  enable: string
  disable: string
  toggleLabel: string
  emptyHint: string
}

export interface HubFolderItemProps {
  node: HubFolderNodeLike
  isExpanded: boolean
  isSelected: boolean
  counts: { total: number; enabled: number }
  isRenaming: boolean
  batchBusy: boolean
  dropMime: string
  labels: HubFolderLabels
  onToggleExpand: (e: React.MouseEvent) => void
  onSelect: () => void
  onBatchToggle: (enabled: boolean) => void
  onStartRename: () => void
  onFinishRename: (nextName: string) => void
  onCreateSubfolder: () => void
  onColorChange: (color: string | null) => void
  onDelete: () => void
  onDropItems: (ids: string[]) => void
  children?: React.ReactNode
}


interface HubFolderState {
  nameInput: string
  setNameInput: React.Dispatch<React.SetStateAction<string>>
  isDragOver: boolean
  setIsDragOver: React.Dispatch<React.SetStateAction<boolean>>
  inputRef: React.RefObject<HTMLInputElement | null>
  moreButtonRef: React.RefObject<HTMLButtonElement | null>
  isMenuOpen: boolean
  setIsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>
  contextMenu: ReturnType<typeof useContextMenu>
  menuItems: MenuItem[]
  row: FolderRowProps
}

export function useHubFolderItem(props: HubFolderItemProps): HubFolderState {
  const toast = useUi((s) => s.toast)
  const [nameInput, setNameInput] = useState(props.node.folder.name)
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const contextMenu = useContextMenu()
  useFolderRename(props, setNameInput, inputRef)
  const drag = useFolderDrag(props.dropMime, props.onDropItems, setIsDragOver)
  const safeTotal = Math.max(0, props.counts.total)
  const safeEnabled = Math.min(Math.max(0, props.counts.enabled), safeTotal)
  const isChecked = safeTotal > 0 && safeEnabled > 0
  const menuItems = buildHubMenuItems(props, safeTotal, safeEnabled)
  const row = buildFolderRow(props, { nameInput, isDragOver, safeTotal, safeEnabled, isChecked, inputRef, moreButtonRef, contextMenu, drag, toast, setIsMenuOpen, setNameInput })
  return { nameInput, setNameInput, isDragOver, setIsDragOver, inputRef, moreButtonRef, isMenuOpen, setIsMenuOpen, contextMenu, menuItems, row }
}

function useFolderRename(props: HubFolderItemProps, setNameInput: React.Dispatch<React.SetStateAction<string>>, inputRef: React.RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    if (props.isRenaming) {
      setNameInput(props.node.folder.name)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [props.isRenaming, props.node.folder.name, setNameInput, inputRef])
}

function useFolderDrag(dropMime: string, onDropItems: (ids: string[]) => void, setIsDragOver: React.Dispatch<React.SetStateAction<boolean>>) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const raw = e.dataTransfer.getData(dropMime)
    if (raw) {
      const ids = tryParseStringArray(raw)
      if (ids.length) {
        onDropItems(ids)
      }
    }
  }
  return { handleDragOver, handleDragLeave, handleDrop }
}

function buildFolderRow(props: HubFolderItemProps, deps: {
  nameInput: string
  isDragOver: boolean
  safeTotal: number
  safeEnabled: number
  isChecked: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  moreButtonRef: React.RefObject<HTMLButtonElement | null>
  contextMenu: ReturnType<typeof useContextMenu>
  drag: ReturnType<typeof useFolderDrag>
  toast: UiState['toast']
  setIsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>
  setNameInput: React.Dispatch<React.SetStateAction<string>>
}): FolderRowProps {
  const { nameInput, isDragOver, safeTotal, safeEnabled, isChecked, inputRef, moreButtonRef, contextMenu, drag, toast, setIsMenuOpen, setNameInput } = deps
  return {
    node: props.node,
    isExpanded: props.isExpanded,
    isSelected: props.isSelected,
    isRenaming: props.isRenaming,
    isDragOver,
    batchBusy: props.batchBusy,
    labels: props.labels,
    counts: { safeTotal, safeEnabled, isChecked },
    nameInput,
    refs: { inputRef, moreButtonRef },
    handlers: {
      onToggleExpand: props.onToggleExpand,
      onSelect: props.onSelect,
      onContextMenu: contextMenu.onContextMenu,
      onDragOver: drag.handleDragOver,
      onDragLeave: drag.handleDragLeave,
      onDrop: drag.handleDrop,
      onNameChange: setNameInput,
      onFinishRename: props.onFinishRename,
      onBatchToggle: props.onBatchToggle,
      onToggleMenu: () => setIsMenuOpen((prev) => !prev),
      onEmptyToast: () => toast({ title: props.labels.emptyHint, tone: 'default' }),
    },
  }
}


function buildHubMenuItems(props: HubFolderItemProps, safeTotal: number, safeEnabled: number): MenuItem[] {
  return [
    {
      id: 'new_subfolder',
      label: t('sidebar.new_subfolder'),
      icon: <FolderPlus size={13} />,
      onSelect: props.onCreateSubfolder,
    },
    {
      id: 'rename',
      label: t('sidebar.rename'),
      icon: <Pencil size={13} />,
      onSelect: props.onStartRename,
    },
    {
      id: 'color',
      label: t('folders.color'),
      icon: <Palette size={13} />,
      submenu: ({ closeMenu }) => (
        <FolderColorSubmenu
          folder={{ color: props.node.folder.color }}
          onSelectColor={(color) => {
            props.onColorChange(color)
            closeMenu()
          }}
          onManageFolders={closeMenu}
        />
      ),
    },
    ...buildBatchMenuItems(props, safeTotal, safeEnabled),
    {
      id: 'delete',
      label: t('common.delete'),
      icon: <Trash2 size={13} />,
      tone: 'danger',
      separatorBefore: true,
      onSelect: props.onDelete,
    },
  ]
}

function buildBatchMenuItems(props: HubFolderItemProps, safeTotal: number, safeEnabled: number): MenuItem[] {
  if (safeTotal <= 0)
    return []
  return [
    safeEnabled < safeTotal
      ? {
        id: 'enable_all',
        label: props.labels.enable,
        icon: <PlayCircle size={13} className='text-[var(--success)]' />,
        onSelect: () => props.onBatchToggle(true),
      }
      : null,
    safeEnabled > 0
      ? {
        id: 'disable_all',
        label: props.labels.disable,
        icon: <PauseCircle size={13} className='text-[var(--warning)]' />,
        onSelect: () => props.onBatchToggle(false),
      }
      : null,
  ].filter(Boolean) as MenuItem[]
}