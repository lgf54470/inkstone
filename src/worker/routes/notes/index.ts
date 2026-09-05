import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { requireAuth } from '../../middleware/auth'
import { registerNotesBacklinksRoutes } from './backlinks'
import { registerNotesCreateRoutes } from './create'
import { registerNotesEditRoutes } from './edit'
import { registerNotesLifecycleRoutes } from './lifecycle'
import { registerNotesListRoutes } from './list'
import { registerNotesTrashRoutes } from './trash'
import { registerNotesVersionsRoutes } from './versions'

export const notesRoutes = new Hono<AppBindings>()

notesRoutes.use('*', requireAuth)

registerNotesListRoutes(notesRoutes)
registerNotesTrashRoutes(notesRoutes)
registerNotesCreateRoutes(notesRoutes)
registerNotesEditRoutes(notesRoutes)
registerNotesLifecycleRoutes(notesRoutes)
registerNotesVersionsRoutes(notesRoutes)
registerNotesBacklinksRoutes(notesRoutes)
