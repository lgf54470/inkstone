import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { requireAuth } from '../../middleware/auth'
import { registerFoldersCrudRoutes } from './crud'

export const foldersRoutes = new Hono<AppBindings>()

foldersRoutes.use('*', requireAuth)

registerFoldersCrudRoutes(foldersRoutes)

export { folderPromotionOrder, parseFolderDeleteStrategy } from './helpers'
