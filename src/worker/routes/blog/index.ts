import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { loadSession } from '../../middleware/auth'
import { registerBlogCommentsRoutes } from './comments'
import { registerBlogOrganizerRoutes } from './organizer'
import { registerBlogPostsRoutes } from './posts'
import { registerBlogPublicRoutes } from './public'
import { registerBlogSettingsRoutes } from './settings'
import { registerBlogStatsRoutes } from './stats'

export const blogManageRoutes = new Hono<AppBindings>()
export const blogPublicRoutes = new Hono<AppBindings>()

// Ensure session loaded for manage routes
blogManageRoutes.use('*', loadSession)

registerBlogStatsRoutes(blogManageRoutes)
registerBlogSettingsRoutes(blogManageRoutes)
registerBlogPostsRoutes(blogManageRoutes)
registerBlogOrganizerRoutes(blogManageRoutes)
registerBlogCommentsRoutes(blogManageRoutes)
registerBlogPublicRoutes(blogPublicRoutes)
