import { Hono, type Context } from 'hono'
import type { DemoState } from '../../state'
import { LIMITS } from '@shared/constants'
import { DEMO_CREDENTIALS } from '../../../lib/runtime'
import { demoMcpSettings, siteInfo, sessionInfo, jsonBody, apiError } from '../helpers/info'

async function loginHandler(c: Context, state: DemoState): Promise<Response> {
  const body = await jsonBody(c.req.raw)
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (username !== DEMO_CREDENTIALS.username || password !== state.password) {
    return apiError(401, 'invalid_credentials', 'Invalid username or password')
  }
  state.authenticated = true
  return c.json(sessionInfo(state))
}

function logoutHandler(c: Context, state: DemoState): Response {
  state.authenticated = false
  return c.json({ ok: true as const })
}

function totpStatusHandler(c: Context): Response {
  return c.json({
    available: false,
    enabled: false,
    enabledAt: null,
    recoveryCodesRemaining: 0,
  })
}

async function passwordHandler(c: Context, state: DemoState): Promise<Response> {
  const body = await jsonBody(c.req.raw)
  if (body.currentPassword !== state.password) {
    return apiError(401, 'wrong_password', 'The current password is incorrect')
  }
  if (typeof body.newPassword !== 'string' || body.newPassword.length < 8) {
    return apiError(400, 'weak_password', 'The new password must contain at least 8 characters')
  }
  if (body.newPassword.length > LIMITS.passwordMaxLength) {
    return apiError(400, 'weak_password', 'The new password is too long')
  }
  state.password = body.newPassword
  return c.json({ ok: true as const })
}

async function profileHandler(c: Context, state: DemoState): Promise<Response> {
  const body = await jsonBody(c.req.raw)
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 64) {
      return apiError(400, 'invalid_profile_name', 'Enter a valid display name')
    }
    state.user = { ...state.user, name: body.name.trim().replace(/\s+/g, ' ') }
  }
  if (body.avatarUrl !== undefined) {
    if (
      typeof body.avatarUrl !== 'string' ||
      !(
        body.avatarUrl === '' ||
        /^dicebear:[0-9a-f]{32}$/.test(body.avatarUrl) ||
        /^data:image\/(?:png|jpeg|webp);base64,/.test(body.avatarUrl)
      )
    ) {
      return apiError(400, 'invalid_avatar', 'Choose a generated avatar or upload an image')
    }
    state.user = { ...state.user, avatarUrl: body.avatarUrl }
  }
  state.cursor++
  return c.json(state.user)
}

async function registrationSettingsHandler(c: Context, state: DemoState): Promise<Response> {
  const body = await jsonBody(c.req.raw)
  if (body.password !== state.password) {
    return apiError(401, 'wrong_password', 'The current password is incorrect')
  }
  state.registrationOpen = body.enabled === true
  return c.json({ ok: true as const, registrationOpen: state.registrationOpen })
}

export function registerAuthRoutes(app: Hono, state: DemoState): void {
  app.get('/api/site', (c) => c.json(siteInfo(state)))
  app.get('/api/auth/session', (c) => c.json(sessionInfo(state)))
  app.post('/api/auth/login', (c) => loginHandler(c, state))
  app.post('/api/auth/register', () => apiError(403, 'registration_closed', 'Registration is closed'))
  app.post('/api/auth/logout', (c) => logoutHandler(c, state))
  app.get('/api/auth/totp/status', totpStatusHandler)
  app.post('/api/auth/password', (c) => passwordHandler(c, state))
  app.put('/api/auth/profile', (c) => profileHandler(c, state))
  app.put('/api/settings/registration', (c) => registrationSettingsHandler(c, state))
  app.get('/api/mcp', (c) => c.json(demoMcpSettings()))
  app.all('/api/mcp', () => apiError(403, 'forbidden', 'MCP is display-only in the demo'))
  app.all('/api/mcp/*', () => apiError(403, 'forbidden', 'MCP is display-only in the demo'))
}