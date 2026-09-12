import type { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { getMeta, setMeta } from '../../db/metadata'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import { musicPublicSettingsSchema } from './schemas'

const PUBLIC_ENABLED_KEY = 'music_public_enabled'
const PUBLIC_OWNER_KEY = 'music_public_owner'

export interface MusicPublicScope {
  userId: string
}

// Publishing is opt-in: the public blog routes read this before serving anything.
export async function loadMusicPublicScope(db: D1Database): Promise<MusicPublicScope | null> {
  const [enabled, userId] = await Promise.all([getMeta(db, PUBLIC_ENABLED_KEY), getMeta(db, PUBLIC_OWNER_KEY)])
  return enabled === '1' && userId ? { userId } : null
}

export function registerMusicSettingsRoutes(routes: Hono<AppBindings>): void {
  routes.get('/public-settings', requireAuth, async (c) => {
    const scope = await loadMusicPublicScope(c.env.DB)
    return c.json({ enabled: scope?.userId === c.get('userId') })
  })

  routes.put('/public-settings', requireAuth, async (c) => {
    const body = await readJsonValidated(c, musicPublicSettingsSchema, JSON_BODY_LIMITS.small)
    const userId = c.get('userId')
    await setMeta(c.env.DB, PUBLIC_ENABLED_KEY, body.enabled ? '1' : '0')
    if (body.enabled) await setMeta(c.env.DB, PUBLIC_OWNER_KEY, userId)
    return c.json({ enabled: body.enabled })
  })
}
