import type { ReactNode } from 'react'

/** The title row every dashboard card wears: an icon, the card's name, and its scope badge. */
export function CardHeader({ icon, title, badge }: { icon: ReactNode; title: string; badge: string }) {
  return (
    <div className='flex items-center justify-between border-b border-[var(--border-subtle)] pb-3'>
      <h3 className='flex items-center gap-1.5 text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]'>
        {icon}
        {title}
      </h3>
      <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
        {badge}
      </span>
    </div>
  )
}

/** What a card draws in place of its rows when the range holds nothing yet. */
export function EmptyRow({ label }: { label: string }) {
  return <p className='py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{label}</p>
}
