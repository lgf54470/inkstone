import { z } from 'zod'
import { Hono } from 'hono'
import type { AppBindings } from '../env'
import { ApiError } from '../lib/errors'
import { requireCurrentPassword } from '../lib/reauth'
import { readJsonValidated } from '../lib/request'
import { loadUser, sessionInfo } from '../lib/session-info'
import {
  cancelTotpSetup,
  completeTotpLogin,
  confirmTotpSetup,
  disableTotp,
  getTotpStatus,
  regenerateRecoveryCodes,
  startTotpSetup,
} from '../lib/totp-service'
import { requireAuth, writeSessionCookie } from '../middleware/auth'

const totpChallengeSchema = z.object({
  challengeToken: z.string().optional(),
  code: z.string().optional(),
})

const totpPasswordSchema = z.object({
  currentPassword: z.string().optional(),
})

const totpSetupConfirmSchema = z.object({
  setupToken: z.string().optional(),
  code: z.string().optional(),
})

const totpSetupCancelSchema = z.object({
  setupToken: z.string().optional(),
})

const totpPasswordChallengeSchema = z.object({
  currentPassword: z.string().optional(),
  code: z.string().optional(),
})

export const totpRoutes = new Hono<AppBindings>()

totpRoutes.post('/login', async (c) => {
  const body = await readJsonValidated(c, totpChallengeSchema, 4096)
  const result = await completeTotpLogin({
    env: c.env,
    challengeToken: body.challengeToken,
    code: body.code,
  })
  const user = await loadUser(c.env, result.userId)
  if (!user) throw ApiError.unauthenticated()
  writeSessionCookie(c, result.sessionToken)
  return c.json({
    ...await sessionInfo(c.env, user),
    recoveryCodeUsed: result.recoveryCodeUsed,
    recoveryCodesRemaining: result.recoveryCodesRemaining,
  })
})

totpRoutes.get('/status', requireAuth, async (c) => {
  return c.json(await getTotpStatus(c.env, c.get('userId')))
})

totpRoutes.post('/setup', requireAuth, async (c) => {
  const body = await readJsonValidated(c, totpPasswordSchema, 4096)
  await requireCurrentPassword(c.env.DB, c.get('userId'), body.currentPassword)
  const user = c.get('user')
  return c.json(await startTotpSetup({
    env: c.env,
    userId: user.id,
    sessionId: c.get('sessionId'),
    issuer: c.env.APP_NAME || 'Inkstone',
    account: user.login,
  }))
})

totpRoutes.post('/setup/confirm', requireAuth, async (c) => {
  const body = await readJsonValidated(c, totpSetupConfirmSchema, 4096)
  return c.json(await confirmTotpSetup({
    env: c.env,
    userId: c.get('userId'),
    sessionId: c.get('sessionId'),
    setupToken: body.setupToken,
    code: body.code,
  }))
})

totpRoutes.delete('/setup', requireAuth, async (c) => {
  const body = await readJsonValidated(c, totpSetupCancelSchema, 4096)
  await cancelTotpSetup({
    db: c.env.DB,
    userId: c.get('userId'),
    sessionId: c.get('sessionId'),
    setupToken: body.setupToken,
  })
  return c.json({ ok: true as const })
})

totpRoutes.post('/recovery-codes', requireAuth, async (c) => {
  const body = await readJsonValidated(c, totpPasswordChallengeSchema, 4096)
  await requireCurrentPassword(c.env.DB, c.get('userId'), body.currentPassword)
  return c.json(await regenerateRecoveryCodes({
    env: c.env,
    userId: c.get('userId'),
    code: body.code,
  }))
})

totpRoutes.delete('/', requireAuth, async (c) => {
  const body = await readJsonValidated(c, totpPasswordChallengeSchema, 4096)
  await requireCurrentPassword(c.env.DB, c.get('userId'), body.currentPassword)
  await disableTotp({
    env: c.env,
    userId: c.get('userId'),
    sessionId: c.get('sessionId'),
    code: body.code,
  })
  return c.json({ ok: true as const })
})
