import { memo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface InspectorSectionProps {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

export const InspectorSection = memo(function InspectorSection({
  title,
  defaultOpen = true,
  children,
}: InspectorSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className='border-b border-[var(--border-subtle)] last:border-b-0'>
      <button
        type='button'
        onClick={() => setIsOpen((o) => !o)}
        className='flex w-full items-center justify-between px-3 py-2 text-left font-semibold text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors select-none'
      >
        <span>{title}</span>
        {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {isOpen && <div className='px-3 pb-3 pt-1 space-y-3'>{children}</div>}
    </div>
  )
})
