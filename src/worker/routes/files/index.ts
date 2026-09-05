import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { registerFilesLibraryRoutes } from './library'
import { registerFilesMaintenanceRoutes } from './maintenance'
import { registerFilesOrganizerRoutes } from './organizer'
import { registerFilesUpdateRoutes } from './update'

export const filesRoutes = new Hono<AppBindings>()

registerFilesOrganizerRoutes(filesRoutes)
registerFilesLibraryRoutes(filesRoutes)
registerFilesUpdateRoutes(filesRoutes)
registerFilesMaintenanceRoutes(filesRoutes)
