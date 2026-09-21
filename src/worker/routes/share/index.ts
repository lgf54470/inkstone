import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { loadSession, requireAuth } from '../../middleware/auth'
import { registerShareAnalyticsRoutes } from './analytics'
import { registerShareBatchRoutes } from './batch'
import { registerCollectionPageRoutes } from './collection-page'
import { registerShareCollectionPublicRoutes } from './collection-public'
import { registerShareCollectionRoutes } from './collections'
import { registerShareNoteRoutes } from './note'
import { registerShareOrganizerRoutes } from './organizer'
import { registerSharePageRoutes } from './page'
import { registerSharePublicRoutes } from './public'
import { registerShareSessionRoutes } from './sessions'
import { registerShareSharingRoutes } from './shares'
import { registerShareVisitsRoutes } from './visits'

export const shareManageRoutes = new Hono<AppBindings>()
export const shareRoutes = new Hono<AppBindings>()
export const sharePageRoutes = new Hono<AppBindings>()
export const collectionPageRoutes = new Hono<AppBindings>()

shareRoutes.use('*', loadSession)
shareManageRoutes.use('*', requireAuth)

registerShareAnalyticsRoutes(shareManageRoutes)
registerShareOrganizerRoutes(shareManageRoutes)
registerShareSharingRoutes(shareManageRoutes)
registerShareBatchRoutes(shareManageRoutes)
registerShareVisitsRoutes(shareManageRoutes)
registerShareSessionRoutes(shareManageRoutes)
// Before the note routes: `/:noteId` is a single segment and would swallow `/collections`, answering
// "note not found" for a route that exists. Every single-segment route has to be registered ahead of
// it, which is why the collection routes sit here rather than with the public ones.
registerShareCollectionRoutes(shareManageRoutes)
registerShareNoteRoutes(shareManageRoutes)
registerSharePublicRoutes(shareRoutes)
registerShareCollectionPublicRoutes(shareRoutes)
registerSharePageRoutes(sharePageRoutes)
registerCollectionPageRoutes(collectionPageRoutes)

export { renderShareShell } from './public'
