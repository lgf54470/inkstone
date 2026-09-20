import { Hono } from 'hono'
import { initializeDatabase } from './db/schema'
import { auditFtsIndex } from './db/fts'
import { ApiError, errorResponse } from './lib/errors'
import { loadSession, requireClientHeader } from './middleware/auth'
import { registerSecurityHeaders } from './middleware/security-headers'
import { authRoutes } from './routes/auth'
import { totpRoutes } from './routes/totp'
import { devRoutes } from './routes/dev'
import { notesRoutes } from './routes/notes'
import { foldersRoutes } from './routes/folders'
import { tagsRoutes } from './routes/tags'
import { searchRoutes } from './routes/search'
import { syncRoutes } from './routes/sync'
import { filesRoutes } from './routes/files'
import { avatarRoutes } from './routes/avatars'
import { backupRoutes } from './routes/backup'
import { settingsRoutes } from './routes/settings'
import { boardLibraryRoutes } from './routes/board-library'
import { kanbanRoutes } from './routes/kanban'
import { shareManageRoutes, sharePageRoutes, shareRoutes } from './routes/share'
import { blogManageRoutes, blogPublicRoutes } from './routes/blog'
import { transferRoutes } from './routes/transfer'
import { updateRoutes } from './routes/update'
import { communityTemplatesRoutes } from './routes/community-templates'
import { musicPageRoutes, musicRoutes } from './routes/music'
import { mcpAuthorizeRoutes } from './routes/mcp-authorize'
import { mcpSettingsRoutes } from './routes/mcp-settings'
import type { AppBindings } from './env'
import { selectAttachmentStorage } from './attachments/backend'

export function createApp() {
  const app = new Hono<AppBindings>()

  app.onError((err, c) => errorResponse(c, err))
  registerSecurityHeaders(app)
  registerDatabaseMiddleware(app)
  registerAuthMiddleware(app)
  registerHealthRoute(app)
  registerApiRoutes(app)

  app.all('/api/*', () => {
    throw ApiError.notFound('API endpoint not found')
  })

  app.route('/s', sharePageRoutes)
  app.route('/playlist', musicPageRoutes)
  app.route('/', mcpAuthorizeRoutes)

  app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

  return app
}

function registerDatabaseMiddleware(app: Hono<AppBindings>): void {
  app.use('/api/*', async (c, next) => {
    c.set('database', await initializeDatabase(c.env))
    await next()
  })
  app.use('/s/*', async (c, next) => {
    c.set('database', await initializeDatabase(c.env))
    await next()
  })
  app.use('/playlist/*', async (c, next) => {
    c.set('database', await initializeDatabase(c.env))
    await next()
  })
  app.use('/authorize', async (c, next) => {
    c.set('database', await initializeDatabase(c.env))
    await next()
  })
}

function registerAuthMiddleware(app: Hono<AppBindings>): void {
  app.use('/api/*', requireClientHeader)
  app.use('/api/*', loadSession)
  app.use('/authorize', loadSession)
}

function registerHealthRoute(app: Hono<AppBindings>): void {
  app.get('/api/health', async (c) => {
    const database = c.get('database')
    const userId = c.get('userId')
    if (!userId) return c.json({ ok: true })
    return c.json({
      ok: true,
      database: 'ready',
      fts: database.ftsEnabled,
      r2: Boolean(c.env.FILES),
      kv: Boolean(c.env.FILES_KV),
      attachmentStorage: selectAttachmentStorage(c.env),
      realtime: Boolean(c.env.SYNC_HUB),
      credentialVault: Boolean(c.env.CREDENTIAL_VAULT),
      mcp: Boolean(c.env.OAUTH_KV),
      // Integrity of the caller's own index: rows beyond the first for a note, and rows whose note
      // is gone. Both read zero when every delete along the maintenance path is doing its job, so
      // they belong where a signed-in caller asks about this instance — the anonymous shape stays
      // free of database work.
      ftsIndex: database.ftsEnabled ? await auditFtsIndex(c.env.DB, userId) : null,
      time: Date.now(),
    })
  })
}

function registerApiRoutes(app: Hono<AppBindings>): void {
  app.route('/api/auth/totp', totpRoutes)
  app.route('/api/auth', authRoutes)
  app.route('/api/notes', notesRoutes)
  app.route('/api/dev', devRoutes)
  app.route('/api/folders', foldersRoutes)
  app.route('/api/tags', tagsRoutes)
  app.route('/api', searchRoutes)
  app.route('/api/sync', syncRoutes)
  app.route('/api/files', filesRoutes)
  app.route('/api/avatars', avatarRoutes)
  app.route('/api/backup', backupRoutes)
  app.route('/api/settings', settingsRoutes)
  app.route('/api/board-library', boardLibraryRoutes)
  app.route('/api/kanban', kanbanRoutes)
  app.route('/api/update', updateRoutes)
  app.route('/api/mcp', mcpSettingsRoutes)
  app.route('/api/share', shareManageRoutes)
  app.route('/api/public', shareRoutes)
  app.route('/api/blog/public', blogPublicRoutes)
  app.route('/api/blog', blogManageRoutes)
  app.route('/api/music', musicRoutes)
  app.route('/api/templates/community', communityTemplatesRoutes)
  app.route('/api', transferRoutes)
}

