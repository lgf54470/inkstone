import { Search } from 'lucide-react'
import { Tooltip } from '../../../components/overlay'
import { IconButton, Kbd } from '../../../components/primitives'
import { useUi } from '../../../store/ui'
import { t } from '../../../lib/i18n'

// The one search entry for every shell (sidebar row, collapsed rail icon): it
// replaces the floating button so the corner it used to claim stays free for
// the music player on mobile.
export function SearchButton({ variant = 'row' }: {
  variant?: 'row' | 'icon'
}) {
  const openPanel = useUi((state) => state.openPanel)
  const label = t('common.search_notes_or_run_a_command')
  const open = () => openPanel('command')

  if (variant === 'icon') {
    return (
      <Tooltip label={label} combo='mod+k' side='right'>
        <IconButton label={label} onClick={open}>
          <Search size={16} />
        </IconButton>
      </Tooltip>
    )
  }

  return (
    <button
      type='button'
      aria-label={label}
      onClick={open}
      className='flex h-9 w-full min-w-0 shrink-0 items-center gap-2 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] px-2.5 text-[length:var(--text-12)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'
    >
      <Search size={14} className='shrink-0' />
      <span className='min-w-0 flex-1 truncate text-left'>{t('shell.search')}</span>
      <Kbd combo='mod+k' />
    </button>
  )
}
