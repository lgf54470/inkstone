import { useEffect, useRef, useState, type ComponentType } from 'react'
import {
  ListTree,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  type LucideProps,
} from 'lucide-react'
import type { TocHeading } from '../lib/markdown/types'
import { t, DEFAULT_LOCALE, type BlogLocale } from '../lib/i18n'

export type Heading = TocHeading

// Sticky header height plus the per-use-case offset. Both call sites must
// agree on the header height, so it is a named constant instead of two magic
// numbers that drift apart.
const STICKY_HEADER_H = 60
const ACTIVE_HEADING_OFFSET = 25
const SCROLL_TARGET_BUFFER = 16

const HEADING_ICONS: Record<number, ComponentType<LucideProps>> = {
  1: Heading1,
  2: Heading2,
  3: Heading3,
  4: Heading4,
  5: Heading5,
  6: Heading6,
}

export function getHeadingIcon(level: number): ComponentType<LucideProps> {
  return HEADING_ICONS[level] ?? Heading6
}

export function getHeadingTypography(level: number, isActive: boolean) {
  switch (level) {
    case 1:
      return {
        fontSize: 'text-[13px]',
        fontWeight: 'font-semibold',
        textColor: isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]',
        iconSize: 12.5,
        iconColor: isActive ? 'text-[var(--accent)] opacity-100' : 'text-[var(--text-tertiary)] opacity-80',
        paddingY: 'py-1',
      }
    case 2:
      return {
        fontSize: 'text-[12px]',
        fontWeight: isActive ? 'font-semibold' : 'font-medium',
        textColor: isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]/85',
        iconSize: 11.5,
        iconColor: isActive ? 'text-[var(--accent)] opacity-100' : 'text-[var(--text-quaternary)] opacity-80',
        paddingY: 'py-1',
      }
    case 3:
      return {
        fontSize: 'text-[11.5px]',
        fontWeight: isActive ? 'font-medium' : 'font-normal',
        textColor: isActive ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]',
        iconSize: 11,
        iconColor: isActive ? 'text-[var(--accent)] opacity-100' : 'text-[var(--text-quaternary)] opacity-70',
        paddingY: 'py-0.5',
      }
    case 4:
      return {
        fontSize: 'text-[11px]',
        fontWeight: isActive ? 'font-medium' : 'font-normal',
        textColor: isActive ? 'text-[var(--accent)]' : 'text-[var(--text-quaternary)]',
        iconSize: 10.5,
        iconColor: isActive ? 'text-[var(--accent)] opacity-100' : 'text-[var(--text-quaternary)] opacity-60',
        paddingY: 'py-0.5',
      }
    default:
      return {
        fontSize: 'text-[10.5px]',
        fontWeight: isActive ? 'font-medium' : 'font-normal',
        textColor: isActive ? 'text-[var(--accent)]' : 'text-[var(--text-quaternary)]',
        iconSize: 10,
        iconColor: isActive ? 'text-[var(--accent)] opacity-100' : 'text-[var(--text-quaternary)] opacity-60',
        paddingY: 'py-0.5',
      }
  }
}

export function outlineMarginTop(heading: Heading, index: number, prevHeading: Heading | undefined): string {
  if (index === 0) return ''
  if (heading.level === 1) return 'mt-1.5'
  if (heading.level === 2 && prevHeading?.level !== 1) return 'mt-0.5'
  return ''
}

function activeHeadingSlug(headings: Heading[]): string | null {
  if (!headings.length) return null
  if (typeof window === 'undefined') return headings[0]?.slug ?? null

  const isBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 30
  if (isBottom) {
    return headings[headings.length - 1]!.slug
  }

  const topOffset = STICKY_HEADER_H + ACTIVE_HEADING_OFFSET
  let current: string | null = headings[0]?.slug ?? null
  for (const heading of headings) {
    const el = document.getElementById(heading.slug)
    if (!el) continue
    const rect = el.getBoundingClientRect()
    if (rect.top <= topOffset) {
      current = heading.slug
    } else {
      break
    }
  }
  return current
}

export function useOutlineActive(headings: Heading[]): string | null {
  const [active, setActive] = useState<string | null>(() => headings[0]?.slug ?? null)
  const rafRef = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined' || headings.length === 0) return

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const next = activeHeadingSlug(headings)
        if (next) setActive(next)
      })
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(rafRef.current)
    }
  }, [headings])

  return active
}

interface OutlineRowProps {
  heading: Heading
  index: number
  active: string | null
  minLevel: number
  prevHeading: Heading | undefined
  onSelect: (heading: Heading) => void
}

function OutlineRow({ heading, index, active, minLevel, prevHeading, onSelect }: OutlineRowProps) {
  const isActive = heading.slug === active
  const typography = getHeadingTypography(heading.level, isActive)
  const HeadingIcon = getHeadingIcon(heading.level)
  const relativeLevel = Math.min(Math.max(0, heading.level - minLevel), 4)
  const marginTopClass = outlineMarginTop(heading, index, prevHeading)

  return (
    <li className={marginTopClass}>
      <button
        type='button'
        aria-current={isActive ? 'location' : undefined}
        data-heading-level={heading.level}
        data-heading-slug={heading.slug}
        title={heading.text}
        onClick={() => onSelect(heading)}
        className={`group relative flex w-full items-center gap-1.5 rounded-[var(--r-sm)] pr-1.5 text-left leading-snug cursor-pointer transition-colors duration-[var(--dur-fast)] ${typography.fontSize} ${typography.fontWeight} ${typography.textColor} ${typography.paddingY} ${
          isActive ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        }`}
        style={{ paddingLeft: 8 + relativeLevel * 10 }}
      >
        {isActive && (
          <span
            aria-hidden='true'
            className='absolute top-1/2 left-0.5 h-3.5 w-[2.5px] -translate-y-1/2 rounded-full bg-[var(--accent)]'
          />
        )}
        <HeadingIcon
          size={typography.iconSize}
          aria-hidden='true'
          className={`shrink-0 transition-opacity duration-[var(--dur-fast)] ${typography.iconColor} ${
            !isActive ? 'group-hover:text-[var(--text-secondary)] group-hover:opacity-100' : ''
          }`}
        />
        <span className='min-w-0 flex-1 truncate'>{heading.text}</span>
      </button>
    </li>
  )
}

function scrollToHeading(heading: Heading): void {
  const el = document.getElementById(heading.slug)
  if (!el) return
  const topOffset = STICKY_HEADER_H + SCROLL_TARGET_BUFFER
  const elementPosition = el.getBoundingClientRect().top
  const offsetPosition = elementPosition + window.pageYOffset - topOffset
  if (typeof window.scrollTo === 'function') {
    window.scrollTo({ top: offsetPosition, behavior: 'smooth' })
  }
  try {
    history.replaceState(null, '', `#${heading.slug}`)
  } catch {
    // replaceState can throw on sandboxed or about: documents; the hash is cosmetic.
  }
}

export interface PostOutlineProps {
  headings: Heading[]
  locale?: BlogLocale
  className?: string
  onSelect?: (heading: Heading) => void
}

export default function PostOutline({ headings, locale = DEFAULT_LOCALE, className = '', onSelect }: PostOutlineProps) {
  const active = useOutlineActive(headings)
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!active || !navRef.current) return
    const activeItem = navRef.current.querySelector<HTMLElement>(`[data-heading-slug="${active}"]`)
    if (activeItem && typeof activeItem.scrollIntoView === 'function') {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [active])

  if (headings.length === 0) return null

  const handleSelect = (heading: Heading) => {
    if (onSelect) {
      onSelect(heading)
    } else {
      scrollToHeading(heading)
    }
  }

  const minLevel = Math.min(...headings.map((h) => h.level))

  return (
    <nav ref={navRef} className={`w-full ${className}`} aria-label={t('common.outline', {}, locale)}>
      <div className='mb-2 flex items-center gap-1.5 px-2 text-[10.5px] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]'>
        <ListTree size={11} aria-hidden='true' />
        <span>{t('common.outline', {}, locale)}</span>
      </div>
      <ul className='space-y-px'>
        {headings.map((heading, index) => (
          <OutlineRow
            key={`${heading.slug}-${index}`}
            heading={heading}
            index={index}
            active={active}
            minLevel={minLevel}
            prevHeading={index > 0 ? headings[index - 1] : undefined}
            onSelect={handleSelect}
          />
        ))}
      </ul>
    </nav>
  )
}
