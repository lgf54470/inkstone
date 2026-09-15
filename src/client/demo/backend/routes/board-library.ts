import { Hono } from 'hono'
import { LIMITS } from '@shared/constants'
import type { DemoState } from '../../state'
import { apiError, jsonBody } from '../helpers/info'

/**
 * The demo keeps the named whiteboard libraries in memory like the rest of its state, with
 * the same contract as the worker route: one JSON document per name, stored verbatim, so
 * the picker and the boards behave here exactly as they do against a real instance within
 * one session.
 */
export function registerBoardLibraryRoutes(app: Hono, state: DemoState): void {
  app.get('/api/board-library', (c) => {
    const name = c.req.query('name')
    if (name === undefined) {
      return c.json({
        libraries: [...state.boardLibraries.entries()]
          .map(([entry, items]) => ({ name: entry, size: items.length, updatedAt: Date.now() }))
          .sort((left, right) => left.name.localeCompare(right.name)),
      })
    }
    const items = state.boardLibraries.get(name) ?? null
    return c.json({ name, items, updatedAt: items === null ? 0 : Date.now() })
  })

  app.put('/api/board-library', async (c) => {
    const body = (await jsonBody(c.req.raw)) as { name?: unknown; items?: unknown }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const items = typeof body.items === 'string' ? body.items : ''
    if (!name) return apiError(400, 'bad_request', 'name: a library needs a name')
    if (name.length > LIMITS.boardLibraryNameMaxLength) return apiError(400, 'bad_request', 'name: too long')
    if (new TextEncoder().encode(items).byteLength > LIMITS.boardLibraryMaxBytes)
      return apiError(413, 'too_large', 'The whiteboard library is too large')
    try {
      if (!Array.isArray(JSON.parse(items))) return apiError(400, 'bad_request', 'items: expected a JSON array')
    } catch {
      return apiError(400, 'bad_request', 'items: expected a JSON array')
    }
    state.boardLibraries.set(name, items)
    return c.json({ name, items, updatedAt: Date.now() })
  })

  app.delete('/api/board-library', (c) => {
    const name = c.req.query('name') ?? ''
    return c.json({ removed: state.boardLibraries.delete(name) })
  })
}
