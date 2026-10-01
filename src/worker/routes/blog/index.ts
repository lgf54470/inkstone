import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { requireAuth } from '../../middleware/auth'
import { registerBlogCommentsRoutes } from './comments'
import { registerBlogLinksRoutes } from './links'
import { registerBlogMediaRoutes } from './media'
import { registerBlogOrganizerRoutes } from './organizer'
import { registerBlogPostsRoutes } from './posts'
import { registerBlogPublicRoutes } from './public'
import { registerBlogSettingsRoutes } from './settings'
import { registerBlogStatsRoutes } from './stats'
import { registerBlogTrashRoutes } from './trash'

export const blogManageRoutes = new Hono<AppBindings>()
export const blogPublicRoutes = new Hono<AppBindings>()

// The session is loaded once by the app (`app.use('/api/*', loadSession)`), so this mount is the
// only place that has to remember the blog is private: with the check here, a route added later
// without its own `requireAuth` is still closed rather than anonymously readable.
blogManageRoutes.use('*', requireAuth)

registerBlogStatsRoutes(blogManageRoutes)
registerBlogSettingsRoutes(blogManageRoutes)
registerBlogPostsRoutes(blogManageRoutes)
registerBlogTrashRoutes(blogManageRoutes)
registerBlogOrganizerRoutes(blogManageRoutes)
registerBlogCommentsRoutes(blogManageRoutes)
registerBlogLinksRoutes(blogManageRoutes)
registerBlogMediaRoutes(blogManageRoutes)
registerBlogPublicRoutes(blogPublicRoutes)
