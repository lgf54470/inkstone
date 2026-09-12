import type { Tag } from '@shared/types'

export interface TagManagerLabels {
  count?: (count: number) => string
  description?: string
  createPlaceholder?: string
}

// The shared tag manager owns the layout; every tag surface supplies its own data layer here.
export interface TagManagerController {
  tags: Tag[]
  create: (name: string) => string | null | void
  rename: (tag: Tag, name: string) => void
  setColor: (tag: Tag, color: string | null) => void
  togglePin: (tag: Tag) => void
  remove: (tag: Tag) => void
  merge?: (source: Tag, target: Tag) => void
  openTag?: (name: string) => void
  removeUnused?: (tags: Tag[]) => void
  labels?: TagManagerLabels
}
