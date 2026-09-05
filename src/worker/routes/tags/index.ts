import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { requireAuth } from '../../middleware/auth'
import { registerTagsCrudRoutes } from './crud'

export const tagsRoutes = new Hono<AppBindings>()

tagsRoutes.use('*', requireAuth)

registerTagsCrudRoutes(tagsRoutes)

export { rewriteTagInNotes } from './helpers'
