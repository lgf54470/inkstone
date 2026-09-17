import { ArrowDownToLine, ArrowUpToLine, ClipboardPaste, Copy, Pencil, Plus, Scissors, Trash2 } from 'lucide-react'
import { Menu, type MenuItem } from '../../../../components/overlay'
import { Z_INDEX } from '../../../../lib/z-index'
import { t } from '../../../i18n'
import type { SlideElement } from '../types'

export type SlidesMenuTarget =
  | { kind: 'element'; element: SlideElement }
  | { kind: 'canvas' }
  | { kind: 'slide'; slideId: string }

export interface SlidesMenuState {
  x: number
  y: number
  target: SlidesMenuTarget
}

export interface SlidesMenuActions {
  onEditText: (elementId: string) => void
  onCopyElement: (elementId: string) => void
  onCutElement: (elementId: string) => void
  onPaste: () => void
  onDuplicateElement: (elementId: string) => void
  onReorderElement: (elementId: string, direction: 'front' | 'back') => void
  onDeleteElement: (elementId: string) => void
  onAddSlide: () => void
  onDuplicateSlide: (slideId: string) => void
  onMoveSlide: (slideId: string, direction: 'up' | 'down') => void
  onDeleteSlide: (slideId: string) => void
}

const MENU_WIDTH = 220

/**
 * The right-click menus, built from what this editor can actually do.
 *
 * A menu row exists only where there is a handler behind it: a deck's canvas is the one
 * place where a reader expects a full menu, so a row that quietly does nothing is worse
 * there than a shorter menu — the reader learns the menu is unreliable instead of learning
 * the feature is missing. Slice and group rows therefore arrive with their features (the
 * grouping pass), not before them; the clipboard rows are here because it has landed.
 */
export function SlidesContextMenu({
  menu,
  actions,
  onClose,
}: {
  menu: SlidesMenuState | null
  actions: SlidesMenuActions
  onClose: () => void
}) {
  if (!menu) return null
  return (
    <Menu
      anchor={{ x: menu.x, y: menu.y }}
      open
      onClose={onClose}
      items={itemsFor(menu.target, actions)}
      width={MENU_WIDTH}
      zIndex={Z_INDEX.hoverPinned}
    />
  )
}

function itemsFor(target: SlidesMenuTarget, actions: SlidesMenuActions): MenuItem[] {
  if (target.kind === 'element') return elementItems(target.element, actions)
  if (target.kind === 'slide') return slideItems(target.slideId, actions)
  return canvasItems(actions)
}

function elementItems(element: SlideElement, actions: SlidesMenuActions): MenuItem[] {
  return [
    ...editRows(element, actions),
    ...clipboardRows(element, actions),
    ...arrangeRows(element, actions),
    {
      id: 'delete-element',
      label: t('common.delete'),
      icon: <Trash2 size={13} />,
      tone: 'danger',
      separatorBefore: true,
      onSelect: () => actions.onDeleteElement(element.id),
    },
  ]
}

function editRows(element: SlideElement, actions: SlidesMenuActions): MenuItem[] {
  if (element.type !== 'text') return []
  return [
    {
      id: 'edit-text',
      label: t('slides.edit_text'),
      icon: <Pencil size={13} />,
      onSelect: () => actions.onEditText(element.id),
    },
  ]
}

/** Copy and cut are the rows a reader reaches for most, so they sit above the rest of the edits. */
function clipboardRows(element: SlideElement, actions: SlidesMenuActions): MenuItem[] {
  return [
    {
      id: 'copy-element',
      label: t('common.copy'),
      icon: <Copy size={13} />,
      onSelect: () => actions.onCopyElement(element.id),
    },
    {
      id: 'cut-element',
      label: t('slides.cut'),
      icon: <Scissors size={13} />,
      onSelect: () => actions.onCutElement(element.id),
    },
    {
      id: 'duplicate-element',
      label: t('slides.duplicate_element'),
      icon: <Copy size={13} />,
      onSelect: () => actions.onDuplicateElement(element.id),
    },
  ]
}

function arrangeRows(element: SlideElement, actions: SlidesMenuActions): MenuItem[] {
  return [
    {
      id: 'bring-to-front',
      label: t('slides.bring_to_front'),
      icon: <ArrowUpToLine size={13} />,
      onSelect: () => actions.onReorderElement(element.id, 'front'),
    },
    {
      id: 'send-to-back',
      label: t('slides.send_to_back'),
      icon: <ArrowDownToLine size={13} />,
      onSelect: () => actions.onReorderElement(element.id, 'back'),
    },
  ]
}

function canvasItems(actions: SlidesMenuActions): MenuItem[] {
  return [
    {
      id: 'add-slide',
      label: t('slides.add_slide'),
      icon: <Plus size={13} />,
      onSelect: actions.onAddSlide,
    },
    {
      id: 'paste',
      label: t('slides.paste'),
      icon: <ClipboardPaste size={13} />,
      separatorBefore: true,
      onSelect: actions.onPaste,
    },
  ]
}

function slideItems(slideId: string, actions: SlidesMenuActions): MenuItem[] {
  return [
    {
      id: 'add-slide',
      label: t('slides.add_slide'),
      icon: <Plus size={13} />,
      onSelect: actions.onAddSlide,
    },
    {
      id: 'move-slide-up',
      label: t('slides.move_slide_up'),
      onSelect: () => actions.onMoveSlide(slideId, 'up'),
    },
    {
      id: 'move-slide-down',
      label: t('slides.move_slide_down'),
      onSelect: () => actions.onMoveSlide(slideId, 'down'),
    },
    {
      id: 'duplicate-slide',
      label: t('slides.duplicate_slide'),
      icon: <Copy size={13} />,
      separatorBefore: true,
      onSelect: () => actions.onDuplicateSlide(slideId),
    },
    {
      id: 'delete-slide',
      label: t('slides.delete_slide'),
      icon: <Trash2 size={13} />,
      tone: 'danger',
      onSelect: () => actions.onDeleteSlide(slideId),
    },
  ]
}
