import { useState, useMemo } from 'react'
import { Search, X, icons } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { t } from '../../../lib/i18n'
import { LinkDynamicIcon } from './link-dynamic-icon'

export interface LinkIconSelectorProps {
  value: string
  onChange: (val: string) => void
}

const PRESET_EMOJIS = [
  '⭐', '🚀', '🔍', '📰', '💻', '🎨', '🎮', '🤖', '📚', '🎵', '🎬',
  '🛒', '💼', '🌐', '📊', '📝', '🔧', '📱', '💡', '🔥', '✨', '⚡',
  '☕', '❤️', '🎯', '🛠️', '🧭', '🛸', '🛰️', '📡', '🔒', '📦',
]

const PRESET_LUCIDE = [
  'Globe', 'Bookmark', 'Star', 'Sparkles', 'Compass', 'Code', 'Terminal',
  'Bot', 'Cpu', 'Layers', 'BookOpen', 'Film', 'Music', 'Gamepad2',
  'ShoppingCart', 'Briefcase', 'Heart', 'Coffee', 'Zap', 'Flame',
  'Search', 'Cloud', 'Database', 'Share2', 'Folder', 'Settings',
  'Shield', 'Wrench', 'Key', 'FileText', 'Send', 'Activity',
]

export function LinkIconSelector({ value, onChange }: LinkIconSelectorProps) {
  const [tab, setTab] = useState<'lucide' | 'emoji'>('lucide')
  const [query, setQuery] = useState('')

  const allIcons: Record<string, LucideIcon | undefined> = icons
  const filteredLucide = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return PRESET_LUCIDE
    const iconNames = Object.keys(allIcons).filter((k) => k !== 'default' && typeof allIcons[k] === 'function')
    return iconNames.filter((name) => name.toLowerCase().includes(q)).slice(0, 48)
  }, [query, allIcons])

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
          <LucideIconGrid icons={filteredLucide} allIcons={allIcons} value={value} onSelect={onChange} />
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
            tab === 'lucide' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t('blog.link_icon_tab_lucide')}
        </button>
        <button
          type='button'
          onClick={() => setTab('emoji')}
          className={`px-2 py-0.5 rounded-[var(--r-sm)] text-[length:var(--text-11)] font-medium transition-colors ${
            tab === 'emoji' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
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
  icons,
  allIcons,
  value,
  onSelect,
}: {
  icons: string[]
  allIcons: Record<string, LucideIcon | undefined>
  value: string
  onSelect: (val: string) => void
}) {
  return (
    <>
      {icons.map((iconName) => {
        const Comp = allIcons[iconName]
        if (!Comp) return null
        const isSelected = value === iconName
        return (
          <button
            key={iconName}
            type='button'
            title={iconName}
            onClick={() => onSelect(iconName)}
            className={`size-7 flex items-center justify-center rounded-[var(--r-sm)] transition-colors ${
              isSelected
                ? 'bg-[var(--accent)] text-white shadow-xs'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Comp size={15} />
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
                ? 'bg-[var(--accent-subtle)] border border-[var(--accent)]'
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
