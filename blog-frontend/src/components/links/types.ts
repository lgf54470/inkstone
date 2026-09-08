import type { BlogPublicLink, BlogPublicLinkCategory } from '../../lib/types'

export type ViewMode = 'detailed' | 'simple'
export type GridColumns = 'auto' | 2 | 3 | 4 | 5

export interface ContextMenuState {
  isOpen: boolean
  x: number
  y: number
  link: BlogPublicLink | null
}

export interface QRModalState {
  isOpen: boolean
  link: BlogPublicLink | null
}

export interface SearchEngine {
  id: string
  name: string
  url: (q: string) => string
}

export interface LinksContainerProps {
  initialLinks: BlogPublicLink[]
  categories: BlogPublicLinkCategory[]
  siteName: string
  siteUrl?: string
  siteDescription?: string
  siteAvatar?: string
}
