import type { Context } from 'hono'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'

export function pathParam(c: Context<AppBindings>, name: string): string {
  const value = c.req.param(name)
  if (!value) throw ApiError.badRequest(`Missing route parameter: ${name}`)
  return value
}
