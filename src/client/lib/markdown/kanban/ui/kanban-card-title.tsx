import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Pencil } from 'lucide-react'
import { t } from '../../../i18n'
import { KanbanIconBadge } from './kanban-icon-badge'

/**
 * The card's title: the one part of a card that is a gesture rather than a value.
 *
 * It has three doors — a click opens the detail, a double click renames in place, and `F2` renames
 * from the keyboard — and the first two share a pointer, which is why the click has to wait. It lives
 * beside the card rather than inside it for the same reason the full screen board's title lives beside
 * its header: a heading that turns into a field and back is a control of its own, and the card around
 * it only decides where it stands.
 */

/**
 * How long a click on a card's title waits before it opens the detail.
 *
 * A title carries two gestures — one click opens, two rename — and a browser reports the second only
 * once it has happened, so the first has to be held back. Without the hold the click opened the
 * dialog and the dialog's own overlay swallowed the second click, which closed it again: the rename
 * never happened, from the pointer or from `dblclick`, which is what the user reported as "double
 * clicking a title does not rename it, it flashes the detail window". A quarter of a second is what
 * the platform's own rename gestures use; it is short enough to read as immediate and long enough to
 * catch a deliberate double click.
 */
export const KANBAN_TITLE_OPEN_DELAY_MS = 250

/**
 * The title's two pointer gestures, the wait between them, and the one key that renames without a
 * pointer at all: `F2`, which is what Windows and every file manager taught for renaming the thing
 * under the caret.
 *
 * A click a keyboard made opens at once — `detail === 0` is how a synthetic activation says it had no
 * second click to wait for, so `Enter` and `Space` on the title stay instant. The pending open is
 * dropped when the card goes away: a filter, a view switch or a move can unmount a card inside the
 * window, and a dialog for a card that is no longer on the board would be a dialog with nothing in it.
 */
export function useCardTitleGestures(onOpenDetail: () => void, startEditing: () => void) {
  const pendingOpenRef = useRef<number | null>(null)

  const cancelPendingOpen = () => {
    if (pendingOpenRef.current === null) return
    window.clearTimeout(pendingOpenRef.current)
    pendingOpenRef.current = null
  }

  useEffect(() => cancelPendingOpen, [])

  const handleTitleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (e.detail === 0) {
      onOpenDetail()
      return
    }
    cancelPendingOpen()
    pendingOpenRef.current = window.setTimeout(() => {
      pendingOpenRef.current = null
      onOpenDetail()
    }, KANBAN_TITLE_OPEN_DELAY_MS)
  }

  const handleTitleDoubleClick = () => {
    cancelPendingOpen()
    startEditing()
  }

  const handleTitleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'F2') return
    e.preventDefault()
    startEditing()
  }

  return { handleTitleClick, handleTitleDoubleClick, handleTitleKeyDown }
}

/** The card's own title, and the value behind it: what it says while it is a heading and while it is a field. */
export function useKanbanCardTitle(initialTitle: string, onUpdate: (title: string) => void) {
  const [isEditing, setIsEditing] = useState(false)
  const [text, setText] = useState(initialTitle)

  const handleBlur = () => {
    setIsEditing(false)
    if (text.trim() && text !== initialTitle) onUpdate(text.trim())
    else setText(initialTitle)
  }

  const handleCancel = () => {
    setText(initialTitle)
    setIsEditing(false)
  }

  return { isEditing, text, setText, startEditing: () => setIsEditing(true), handleBlur, handleCancel }
}

/**
 * The door a pointer that does not know about the double click can walk through, drawn on the title's
 * own row: the gesture the board's title offers in its full screen view, and the one a screen reader
 * or a keyboard reaches without knowing any gesture at all. It is hidden until the card is hovered or
 * the button is focused — never from the keyboard, which is what `focus-visible` is for.
 */
function CardRenameButton({ onStartEditing }: { onStartEditing: () => void }) {
  return (
    <button
      type='button'
      onClick={onStartEditing}
      aria-label={t('preview.kanban_rename_card')}
      title={t('preview.kanban_rename_card')}
      data-kanban-rename-card=''
      className='shrink-0 rounded-[var(--r-xs)] p-0.5 text-[var(--text-tertiary)] opacity-0 transition-opacity hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:opacity-100 group-hover/card:opacity-100'
    >
      <Pencil size={12} aria-hidden />
    </button>
  )
}

/** The title's field, which is what the row turns into while the card is being renamed. */
function CardTitleEditor({
  icon,
  titleText,
  onChangeText,
  onBlur,
  onCancel,
}: {
  icon?: string
  titleText: string
  onChangeText: (text: string) => void
  onBlur: () => void
  onCancel: () => void
}) {
  return (
    <div className='flex items-center gap-1.5'>
      {icon && <KanbanIconBadge icon={icon} size={15} />}
      <input
        type='text'
        data-owns-escape='true'
        value={titleText}
        autoFocus
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChangeText(e.target.value)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onBlur()
          if (e.key === 'Escape') onCancel()
        }}
        className='w-full rounded-[var(--r-xs)] border border-[var(--accent)] bg-[var(--bg-inset)] px-1.5 py-0.5 text-[length:var(--text-14)] font-semibold text-[var(--text-primary)] outline-none'
      />
    </div>
  )
}

/**
 * The title as it reads on the card. A card is a third-level heading under the board's own title: the
 * board's `<h2>` (kanban-header) and then the cards, with no level skipped in between. As an `h4` the
 * card jumped a level, which is what a browser reading this surface reports as heading-order.
 *
 * The heading is the card's heading and nothing else: both of the card's title gestures live on the
 * button inside it — a click opens the detail, a double click starts editing — which is what having
 * them on the heading itself cost (an affordance on a non-interactive element, and a keyboard that
 * could reach neither of them). The heading carries no type of its own either: the size and weight sit
 * on the wrapper in `CardBody`, because a note's stylesheet owns an `h3` and would win any utility
 * written here (styles/kanban.css hands it back for the board's own markup).
 *
 * The rename button stands beside the heading rather than inside it, and that is not only a matter of
 * taste: the heading is what the browser reads out as the card's name, and it is the box the reveal
 * rows are measured against — a control drawn *within* it would read as a control covering the title
 * it belongs to. Beside it, with the row's gap between them, the two boxes never meet.
 */
function CardTitleView({
  title,
  icon,
  onStartEditing,
  onTitleClick,
  onTitleDoubleClick,
  onTitleKeyDown,
}: {
  title: string
  icon?: string
  onStartEditing: () => void
  onTitleClick: (e: MouseEvent<HTMLButtonElement>) => void
  onTitleDoubleClick: () => void
  onTitleKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
}) {
  return (
    <div className='flex items-start gap-1.5 text-[var(--text-primary)]'>
      <h3 className='flex min-w-0 items-start gap-1.5'>
        {icon && (
          <span className='mt-0.5 shrink-0'>
            <KanbanIconBadge icon={icon} size={15} />
          </span>
        )}
        <button
          type='button'
          onClick={onTitleClick}
          onDoubleClick={onTitleDoubleClick}
          onKeyDown={onTitleKeyDown}
          className='line-clamp-2 min-w-0 cursor-pointer text-left hover:text-[var(--accent)]'
        >
          {title || t('preview.kanban_untitled')}
        </button>
      </h3>
      <CardRenameButton onStartEditing={onStartEditing} />
    </div>
  )
}

export function CardTitle({
  title,
  icon,
  isEditing,
  titleText,
  onChangeText,
  onStartEditing,
  onTitleClick,
  onTitleDoubleClick,
  onTitleKeyDown,
  onBlur,
  onCancel,
}: {
  title: string
  icon?: string
  isEditing: boolean
  titleText: string
  onChangeText: (text: string) => void
  onStartEditing: () => void
  onTitleClick: (e: MouseEvent<HTMLButtonElement>) => void
  onTitleDoubleClick: () => void
  onTitleKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
  onBlur: () => void
  onCancel: () => void
}) {
  if (isEditing) {
    return <CardTitleEditor icon={icon} titleText={titleText} onChangeText={onChangeText} onBlur={onBlur} onCancel={onCancel} />
  }

  return (
    <CardTitleView
      title={title}
      icon={icon}
      onStartEditing={onStartEditing}
      onTitleClick={onTitleClick}
      onTitleDoubleClick={onTitleDoubleClick}
      onTitleKeyDown={onTitleKeyDown}
    />
  )
}
