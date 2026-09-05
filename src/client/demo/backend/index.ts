import { Hono } from 'hono'
import { createDemoState } from '../state'
import { apiError } from './helpers/info'
import { registerAuthRoutes } from './routes/auth'
import { registerTemplatesRoutes } from './routes/templates'
import { registerNotesRoutes } from './routes/notes'
import { registerFoldersRoutes } from './routes/folders'
import { registerTagsRoutes } from './routes/tags'
import { registerSearchRoutes } from './routes/search'
import { registerFilesRoutes } from './routes/files'
import { registerSettingsRoutes } from './routes/settings'
import { registerShareRoutes } from './routes/share'
import { registerShareAdminRoutes } from './routes/share-admin'
import { registerBackupRoutes } from './routes/backup'

interface DemoBackend {
  fetch: (request: Request) => Promise<Response>
}

export function createDemoBackend(): DemoBackend {
  const state = createDemoState()
  const app = new Hono()

  app.use('/api/*', async (c, next) => {
    const path = c.req.path
    if (
      path === '/api/site' ||
      path === '/api/auth/session' ||
      path === '/api/auth/login' ||
      path.startsWith('/api/public/')
    ) {
      return next()
    }
    if (!state.authenticated) return apiError(401, 'unauthenticated', 'Please sign in first')
    return next()
  })

  registerAuthRoutes(app, state)
  registerTemplatesRoutes(app, state)
  registerNotesRoutes(app, state)
  registerFoldersRoutes(app, state)
  registerTagsRoutes(app, state)
  registerSearchRoutes(app, state)
  registerFilesRoutes(app, state)
  registerSettingsRoutes(app, state)
  registerShareRoutes(app, state)
  registerShareAdminRoutes(app, state)
  registerBackupRoutes(app, state)

  app.all('/api/*', () => apiError(404, 'not_found', 'Demo endpoint not found'))

  return { fetch: (request) => Promise.resolve(app.fetch(request)) }
}
