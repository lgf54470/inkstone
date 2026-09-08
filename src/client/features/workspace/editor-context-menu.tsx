import { Menu } from '../../components/overlay'
import { Z_INDEX } from '../../lib/z-index'
import { useEditorMenuItems, type EditorContextMenuProps } from './use-editor-context-menu'

export type { EditorContextMenuProps } from './use-editor-context-menu'

const MENU_WIDTH = 216

export function EditorContextMenu(props: EditorContextMenuProps) {
  const items = useEditorMenuItems(props)
  const { point, onClose } = props

  if (!point || items.length === 0) return null

  return <Menu anchor={point} open={Boolean(point)} onClose={onClose} items={items} width={MENU_WIDTH} zIndex={Z_INDEX.hoverPinned} />
}