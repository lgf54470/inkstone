import { cn } from '../../../lib/cn'

/**
 * Count badges sit on rows that take the accent tint when they are selected,
 * and the dimmest text tier does not clear AA on that tint (the axe gate
 * measured 3.86:1 on a selected row), so the selected row uses the next tier up.
 */
export function countBadgeTone(active: boolean): string {
  return cn('shrink-0 text-[length:var(--text-11)] tabular', active ? 'text-[var(--text-secondary)]' : 'text-[var(--text-quaternary)]')
}
