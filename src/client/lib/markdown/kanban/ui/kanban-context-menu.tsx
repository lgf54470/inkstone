import { useMemo } from 'react'
import {
  Copy,
  FileText,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Plus,
  PlusSquare,
  Redo2,
  SlidersHorizontal,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { Menu, submenuFor, type MenuItem } from '../../../../components/overlay'
import { Z_INDEX } from '../../../../lib/z-index'
import { t } from '../../../i18n'
import { formatKanbanViewName } from '../i18n-helpers'
import type { KanbanItem, KanbanView } from '../types'
import type { CardSize } from './kanban-view-options'

export interface KanbanContextMenuProps {
  point: { x: number; y: number } | null
  targetItem: KanbanItem | null
  selectedCount: number
  activeView: KanbanView
  views: KanbanView[]
  cardSize?: CardSize
  canUndo?: boolean
  canRedo?: boolean
  isFullscreen?: boolean
  onClose: () => void
  onOpenDetail?: (item: KanbanItem) => void
  onDuplicateItem?: (item: KanbanItem) => void
  onDeleteItem?: (id: string) => void
  onAddItem: () => void
  onAddColumn?: () => void
  onSelectView?: (viewId: string) => void
  onChangeCardSize?: (size: CardSize) => void
  onBatchDelete?: () => void
  onClearSelection?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onToggleFullscreen?: () => void
}

function buildItemSpecificItems(props: KanbanContextMenuProps, item: KanbanItem): MenuItem[] {
  const items: MenuItem[] = [
    {
      id: 'kanban-item-detail',
      label: t('preview.kanban_card_details'),
      icon: <FileText size={14} />,
      onSelect: () => props.onOpenDetail?.(item),
    },
  ]
  if (props.onDuplicateItem) {
    items.push({
      id: 'kanban-item-duplicate',
      label: t('preview.kanban_duplicate_subitem'),
      icon: <Copy size={14} />,
      onSelect: () => props.onDuplicateItem?.(item),
    })
  }
  if (props.onDeleteItem) {
    items.push({
      id: 'kanban-item-delete',
      label: t('common.delete'),
      icon: <Trash2 size={14} />,
      tone: 'danger',
      onSelect: () => props.onDeleteItem?.(item.id),
    })
  }
  return items
}

function buildSelectionItems(props: KanbanContextMenuProps): MenuItem[] {
  if (props.selectedCount <= 0 || !props.onBatchDelete) return []
  return [
    {
      id: 'kanban-batch-delete',
      label: `${t('preview.kanban_batch_delete')} (${props.selectedCount})`,
      icon: <Trash2 size={14} />,
      tone: 'danger',
      separatorBefore: true,
      onSelect: props.onBatchDelete,
    },
    {
      id: 'kanban-clear-selection',
      label: t('preview.kanban_clear_selection'),
      icon: <X size={14} />,
      onSelect: props.onClearSelection,
    },
  ]
}

function buildHistoryItems(props: KanbanContextMenuProps): MenuItem[] {
  const items: MenuItem[] = []
  if (props.onUndo) {
    items.push({
      id: 'kanban-undo',
      label: t('common.undo'),
      icon: <Undo2 size={14} />,
      combo: 'Ctrl+Z',
      disabled: !props.canUndo,
      separatorBefore: true,
      onSelect: props.onUndo,
    })
  }
  if (props.onRedo) {
    items.push({
      id: 'kanban-redo',
      label: t('command.redo'),
      icon: <Redo2 size={14} />,
      combo: 'Ctrl+Y',
      disabled: !props.canRedo,
      onSelect: props.onRedo,
    })
  }
  return items
}

function buildViewOptionsSubmenu(props: KanbanContextMenuProps): MenuItem[] {
  const items: MenuItem[] = []
  if (props.views.length > 1 && props.onSelectView) {
    items.push({
      id: 'kanban-switch-view',
      label: t('preview.kanban_views'),
      icon: <LayoutGrid size={14} />,
      separatorBefore: true,
      submenu: submenuFor(
        props.views.map((v) => ({
          id: `view-${v.id}`,
          label: formatKanbanViewName(v),
          checked: v.id === props.activeView.id,
          onSelect: () => props.onSelectView?.(v.id),
        })),
      ),
    })
  }
  if (props.activeView.type === 'board' && props.cardSize && props.onChangeCardSize) {
    items.push({
      id: 'kanban-card-size',
      label: t('preview.kanban_card_size'),
      icon: <SlidersHorizontal size={14} />,
      submenu: submenuFor([
        {
          id: 'size-small',
          label: t('preview.kanban_card_size_small'),
          checked: props.cardSize === 'small',
          onSelect: () => props.onChangeCardSize?.('small'),
        },
        {
          id: 'size-medium',
          label: t('preview.kanban_card_size_medium'),
          checked: props.cardSize === 'medium',
          onSelect: () => props.onChangeCardSize?.('medium'),
        },
        {
          id: 'size-large',
          label: t('preview.kanban_card_size_large'),
          checked: props.cardSize === 'large',
          onSelect: () => props.onChangeCardSize?.('large'),
        },
      ]),
    })
  }
  return items
}

function buildFullscreenItem(props: KanbanContextMenuProps): MenuItem[] {
  if (!props.onToggleFullscreen) return []
  return [
    {
      id: 'kanban-toggle-fullscreen',
      label: props.isFullscreen ? t('preview.kanban_exit_fullscreen') : t('preview.kanban_fullscreen'),
      icon: props.isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />,
      combo: props.isFullscreen ? 'Esc' : undefined,
      separatorBefore: true,
      onSelect: props.onToggleFullscreen,
    },
  ]
}

export function buildKanbanContextMenuItems(props: KanbanContextMenuProps): MenuItem[] {
  const { targetItem } = props
  if (targetItem) {
    return [
      ...buildItemSpecificItems(props, targetItem),
      ...buildSelectionItems(props),
      {
        id: 'kanban-new-item',
        label: t('preview.kanban_new_item'),
        icon: <Plus size={14} />,
        separatorBefore: true,
        onSelect: props.onAddItem,
      },
      ...buildHistoryItems(props),
      ...buildFullscreenItem(props),
    ]
  }

  const baseItems: MenuItem[] = [
    {
      id: 'kanban-new-item',
      label: t('preview.kanban_new_item'),
      icon: <Plus size={14} />,
      onSelect: props.onAddItem,
    },
  ]
  if (props.onAddColumn) {
    baseItems.push({
      id: 'kanban-new-group',
      label: t('preview.kanban_new_group'),
      icon: <PlusSquare size={14} />,
      onSelect: props.onAddColumn,
    })
  }

  return [
    ...baseItems,
    ...buildSelectionItems(props),
    ...buildViewOptionsSubmenu(props),
    ...buildHistoryItems(props),
    ...buildFullscreenItem(props),
  ]
}

const MENU_WIDTH = 208

export function KanbanContextMenu(props: KanbanContextMenuProps) {
  const { point, onClose } = props
  const items = useMemo(() => buildKanbanContextMenuItems(props), [props])

  if (!point || items.length === 0) return null

  return (
    <Menu
      anchor={point}
      open={Boolean(point)}
      onClose={onClose}
      items={items}
      width={MENU_WIDTH}
      zIndex={Z_INDEX.hoverPinned}
    />
  )
}
