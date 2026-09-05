import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { registerSearchGraphRoutes } from './graph'
import { registerSearchQueryRoutes } from './query'
import { registerSearchReindexRoutes } from './reindex'

export const searchRoutes = new Hono<AppBindings>()

registerSearchQueryRoutes(searchRoutes)
registerSearchGraphRoutes(searchRoutes)
registerSearchReindexRoutes(searchRoutes)

export type { ParsedQuery, UserSearchResult } from './helpers'
export { parseQuery, searchUserNotes } from './helpers'
