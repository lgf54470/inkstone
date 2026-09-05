import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { loadSession, requireAuth } from '../../middleware/auth'
import { registerShareAnalyticsRoutes } from './analytics'
import { registerShareBatchRoutes } from './batch'
import { registerShareNoteRoutes } from './note'
import { registerShareOrganizerRoutes } from './organizer'
import { registerSharePageRoutes } from './page'
import { registerSharePublicRoutes } from './public'
import { registerShareSharingRoutes } from './shares'
import { registerShareVisitsRoutes } from './visits'

export const shareManageRoutes = new Hono<AppBindings>()
export const shareRoutes = new Hono<AppBindings>()
export const sharePageRoutes = new Hono<AppBindings>()

shareRoutes.use('*', loadSession)
shareManageRoutes.use('*', requireAuth)

registerShareAnalyticsRoutes(shareManageRoutes)
registerShareOrganizerRoutes(shareManageRoutes)
registerShareSharingRoutes(shareManageRoutes)
registerShareBatchRoutes(shareManageRoutes)
registerShareVisitsRoutes(shareManageRoutes)
registerShareNoteRoutes(shareManageRoutes)
registerSharePublicRoutes(shareRoutes)
registerSharePageRoutes(sharePageRoutes)
