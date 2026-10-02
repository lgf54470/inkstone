import { Menu } from '../../components/overlay'
import { Z_INDEX } from '../../lib/z-index'
import { ContextMenuToolbar, getToolbarSearchActions } from './context-menu/toolbar'
import { useEditorContextMenu, type EditorContextMenuProps } from './use-editor-context-menu'

export type { EditorContextMenuProps } from './use-editor-context-menu'

const MENU_WIDTH = 224

export function EditorContextMenu(props: EditorContextMenuProps) {
  const { toolbarProps, menuItems } = useEditorContextMenu(props)
  const { point, onClose } = props

  if (!point || menuItems.length === 0) return null

  return (
    <Menu
      anchor={point}
      open={Boolean(point)}
      onClose={onClose}
      items={menuItems}
      width={MENU_WIDTH}
      zIndex={Z_INDEX.hoverPinned}
      header={<ContextMenuToolbar {...toolbarProps} />}
      toolbarActions={getToolbarSearchActions(toolbarProps)}
      searchable
    />
  )
}