/**
 * The row both menu surfaces draw: the dropped-down menu and the nested submenu lists.
 *
 * It is a raw `<button>` on purpose. `Button` fixes a height and padding per size and wraps its
 * children in one non-stretching span, while a menu row is a fixed-height track holding a 16px
 * icon, a label that has to stretch and truncate, a check mark and a shortcut or a panel arrow as
 * siblings — the shape `Button` cannot express. What the two surfaces do *not* share is how a key
 * reaches a row: the menu
 * keeps a cursor index and moves it, the submenu lists move the DOM focus. So this file owns the
 * shape and the ARIA the row states about itself, and each caller passes its own keyboard wiring,
 * its own way of marking the row the person is on, and its own check mark.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Kbd } from '../primitives'
import type { MenuItem } from './use-menu'

/**
 * The track itself, without the tone or the mark of the row's own list: a full-width row that is a
 * phone-height touch target and a tighter one on a pointer device.
 */
const ROW_CLASS = cn(
  'flex h-10 w-full items-center rounded-[var(--r-sm)] px-2 text-left text-[length:var(--text-12\\.5)] md:h-7.5',
  'transition-colors duration-[var(--dur-xs)] disabled:pointer-events-none disabled:opacity-40',
)

/** The gap the dropped-down menu leaves between its slots, and the tighter one a nested list uses. */
const MENU_GAP = 'gap-2.5'
const SUBMENU_GAP = 'gap-2'

interface MenuRowProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'role' | 'aria-checked' | 'type' | 'children'> {
  item: MenuItem
  /** The mark drawn after the label when the row is checked: a glyph in the menu, an icon in a list. */
  check?: ReactNode
  /** Asked for by the submenu lists, whose rows sit a hair tighter than the menu's. */
  tight?: boolean
  /** Alignment for the panel arrow: the menu pushes it to the far edge, a list lets it follow. */
  arrowClassName?: string
}

export function MenuRow({ item, check, tight, arrowClassName, className, ...row }: MenuRowProps) {
  return (
    <button
      {...row}
      type='button'
      role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={item.checked}
      disabled={item.disabled}
      className={cn(ROW_CLASS, tight ? SUBMENU_GAP : MENU_GAP, className)}
    >
      {item.icon && <span className='flex size-4 shrink-0 items-center justify-center opacity-85'>{item.icon}</span>}
      <span className='min-w-0 flex-1 truncate'>{item.label}</span>
      {item.checked && check}
      {item.submenu
        ? <ChevronRight size={13} className={cn('shrink-0 opacity-70', arrowClassName)} />
        : item.combo && <Kbd combo={item.combo} />}
    </button>
  )
}
