import { useState, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { DynamicIcon } from 'lucide-react/dynamic'
import { t } from '../../../lib/i18n'
import { LinkDynamicIcon } from './link-dynamic-icon'
import { LUCIDE_LINK_ICON_NAMES, PRESET_LINK_ICON_NAMES, lucideSlugOf } from './link-icons'

export interface LinkIconSelectorProps {
  value: string
  onChange: (val: string) => void
}

const PRESET_EMOJIS = [
  '⭐', '🚀', '🔍', '📰', '💻', '🎨', '🎮', '🤖', '📚', '🎵', '🎬',
  '🛒', '💼', '🌐', '📊', '📝', '🔧', '📱', '💡', '🔥', '✨', '⚡',
  '☕', '❤️', '🎯', '🛠️', '🧭', '🛸', '🛰️', '📡', '🔒', '📦',
]

const MAX_ICON_RESULTS = 48

export function LinkIconSelector({ value, onChange }: LinkIconSelectorProps) {
  const [tab, setTab] = useState<'lucide' | 'emoji'>('lucide')
  const [query, setQuery] = useState('')

  // An unqueried picker draws the presets, which are already imported, and a query is matched
  // against lucide's name list — matching costs no request and no icon code; the cells that end up
  // drawn fetch their own module (see `link-icons.ts`).
  const filteredLucide = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return PRESET_LINK_ICON_NAMES
    return LUCIDE_LINK_ICON_NAMES.filter((name) => name.toLowerCase().includes(q)).slice(0, MAX_ICON_RESULTS)
  }, [query])

  return (
    <div className='rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)] p-2.5 space-y-2 text-[length:var(--text-12)]'>
      <IconSelectorHeader tab={tab} setTab={setTab} value={value} onClear={() => onChange('')} />

      {tab === 'lucide' && (
        <div className='relative'>
          <Search size={12} className='absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)]' />
          <input
            type='text'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('blog.link_icon_search_lucide')}
            className='w-full pl-7 pr-2.5 py-1 text-[length:var(--text-11)] rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] focus:outline-hidden focus:border-[var(--accent)]'
          />
        </div>
      )}

      <div className='grid grid-cols-8 gap-1 max-h-32 overflow-y-auto p-1 bg-[var(--bg-surface)] rounded-[var(--r-sm)] border border-[var(--border-subtle)]'>
        {tab === 'lucide' ? (
          <LucideIconGrid names={filteredLucide} value={value} onSelect={onChange} />
        ) : (
          <EmojiIconGrid value={value} onSelect={onChange} />
        )}
      </div>
    </div>
  )
}

function IconSelectorHeader({
  tab,
  setTab,
  value,
  onClear,
}: {
  tab: 'lucide' | 'emoji'
  setTab: (t: 'lucide' | 'emoji') => void
  value: string
  onClear: () => void
}) {
  return (
    <div className='flex items-center justify-between gap-2'>
      <div className='flex rounded-[var(--r-sm)] bg-[var(--bg-surface)] p-0.5 border border-[var(--border-subtle)]'>
        <button
          type='button'
          onClick={() => setTab('lucide')}
          className={`px-2 py-0.5 rounded-[var(--r-sm)] text-[length:var(--text-11)] font-medium transition-colors ${
            tab === 'lucide' ? 'bg-[var(--accent)] text-[var(--accent-contrast)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t('blog.link_icon_tab_lucide')}
        </button>
        <button
          type='button'
          onClick={() => setTab('emoji')}
          className={`px-2 py-0.5 rounded-[var(--r-sm)] text-[length:var(--text-11)] font-medium transition-colors ${
            tab === 'emoji' ? 'bg-[var(--accent)] text-[var(--accent-contrast)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t('blog.link_icon_tab_emoji')}
        </button>
      </div>

      {value && (
        <div className='flex items-center gap-1.5 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          <span>{t('blog.link_icon_current')}</span>
          <div className='size-5 flex items-center justify-center rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]'>
            <LinkDynamicIcon icon={value} size={14} />
          </div>
          <button
            type='button'
            onClick={onClear}
            className='p-0.5 text-[var(--text-quaternary)] hover:text-[var(--danger)] transition-colors'
            title={t('blog.link_icon_clear')}
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

function LucideIconGrid({
  names,
  value,
  onSelect,
}: {
  names: readonly string[]
  value: string
  onSelect: (val: string) => void
}) {
  return (
    <>
      {names.map((iconName) => {
        const slug = lucideSlugOf(iconName)
        if (!slug) return null
        const isSelected = value === iconName
        return (
          <button
            key={iconName}
            type='button'
            title={iconName}
            onClick={() => onSelect(iconName)}
            className={`size-7 flex items-center justify-center rounded-[var(--r-sm)] transition-colors ${
              isSelected
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-xs'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <DynamicIcon name={slug} size={15} />
          </button>
        )
      })}
    </>
  )
}

function EmojiIconGrid({
  value,
  onSelect,
}: {
  value: string
  onSelect: (val: string) => void
}) {
  return (
    <>
      {PRESET_EMOJIS.map((emoji) => {
        const isSelected = value === emoji
        return (
          <button
            key={emoji}
            type='button'
            title={emoji}
            onClick={() => onSelect(emoji)}
            className={`size-7 flex items-center justify-center rounded-[var(--r-sm)] text-[length:var(--text-14)] transition-colors ${
              isSelected
                ? 'bg-[var(--accent-soft)] border border-[var(--accent)]'
                : 'hover:bg-[var(--bg-hover)]'
            }`}
          >
            {emoji}
          </button>
        )
      })}
    </>
  )
}
