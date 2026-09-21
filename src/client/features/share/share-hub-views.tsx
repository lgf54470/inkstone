import type { ReactNode } from 'react'
import type { ShareCategory, ShareInfo } from '@shared/types'
import type { ShareStatusCategory } from '@shared/share-selection'
import { ShareDashboardView } from './share-dashboard-view'
import { ShareCollectionsPanel } from './share-collections-panel'
import { ShareListView } from './share-list-view'

/**
 * What each hub category is: one view, and what the hub has to have loaded before it can paint. The
 * shell above it decides only which category is open — it does not know that two of them read
 * endpoints the others never touch, which is what used to be written out in the shell twice (once for
 * what to render, once for what to preload) and had to be kept in step by hand.
 *
 * The callbacks are the *shell's* intents — open this overlay for this row — so a view never reaches
 * into the hub's state, and the same props serve a list row and a dashboard card.
 */
export interface ShareHubViewProps {
  /** Row actions, addressed by the share the row holds. */
  onOpenQr: (share: ShareInfo) => void
  onOpenEdit: (share: ShareInfo) => void
  /** Insight panels are addressed by note id: a dashboard card knows the note, not the share row. */
  onOpenNoteAnalytics: (noteId: string) => void
  onOpenLogs: (noteId?: string) => void
  onOpenSettings: () => void
}

/**
 * `stats` is the one read two views share: the counters behind the sidebar, which come from the list
 * endpoint asked for on its own. A view that needs rows says `list`; a view that fetches on mount
 * needs neither, and says so by naming the counters it watches.
 */
export type ShareHubPreload = 'list' | 'stats'

export interface ShareHubView {
  preload: ShareHubPreload
  Component: (props: ShareHubViewProps) => ReactNode
}

const LIST_VIEW: ShareHubView = { preload: 'list', Component: ShareListView }

/**
 * The two records together are the completeness check: a category joining `ShareCategory` stops
 * compiling until it is given a view, and a category that filters by status stops compiling until it
 * is listed here as one of these.
 */
const STATUS_VIEWS: Record<ShareStatusCategory, ShareHubView> = {
  all: LIST_VIEW,
  active: LIST_VIEW,
  pinned: LIST_VIEW,
  starred: LIST_VIEW,
  paused: LIST_VIEW,
  password: LIST_VIEW,
  expiring_soon: LIST_VIEW,
  expiring: LIST_VIEW,
  permanent: LIST_VIEW,
  expired: LIST_VIEW,
}

export const SHARE_HUB_VIEWS: Record<ShareCategory, ShareHubView> = {
  ...STATUS_VIEWS,
  dashboard: {
    preload: 'stats',
    Component: ({ onOpenNoteAnalytics, onOpenLogs }) => (
      <ShareDashboardView onSelectNoteAnalytics={onOpenNoteAnalytics} onOpenLogs={() => onOpenLogs()} />
    ),
  },
  collections: { preload: 'stats', Component: () => <ShareCollectionsPanel /> },
}
