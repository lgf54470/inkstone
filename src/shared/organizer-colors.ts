export const BLOG_CATEGORY_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
] as const

import type { MessageKey } from './locales/en-US'

/** How each palette colour is *said*, so a swatch can name itself to a reader who never sees it (G-46). */
export const ORGANIZER_COLOR_MESSAGE_KEYS = {
  '#dc2626': 'color.red',
  '#ea580c': 'color.orange',
  '#ca8a04': 'color.amber',
  '#65a30d': 'color.olive',
  '#059669': 'color.emerald',
  '#0891b2': 'color.cyan',
  '#4f46e5': 'color.indigo',
  '#9333ea': 'color.purple',
  '#db2777': 'color.magenta',
  '#64748b': 'color.slate',
} as const satisfies Record<(typeof ORGANIZER_COLORS)[number], MessageKey>

export const ORGANIZER_COLORS = [
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#65a30d',
  '#059669',
  '#0891b2',
  '#4f46e5',
  '#9333ea',
  '#db2777',
  '#64748b',
] as const


type OrganizerColor = (typeof ORGANIZER_COLORS)[number]

/**
 * What a swatch says about itself. A colour stored outside the palette — one a reader typed into an older
 * record, say — has no name to lose, so it keeps its value rather than going unnamed.
 */
export function organizerColorLabel(color: string, translate: (key: MessageKey) => string): string {
  const key = (ORGANIZER_COLOR_MESSAGE_KEYS as Record<string, MessageKey | undefined>)[color]
  return key ? translate(key) : color
}


function isOrganizerColor(value: unknown): value is OrganizerColor {
  return typeof value === 'string' && (ORGANIZER_COLORS as readonly string[]).includes(value)
}

export function organizerColorOrNull(value: unknown): OrganizerColor | null {
  return isOrganizerColor(value) ? value : null
}
