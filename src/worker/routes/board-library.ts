/**
 * The whiteboard library endpoint. An account owns named libraries — one document each —
 * so the same route answers the picker (no `name`: the list), a board opening its library
 * (`?name=`), a save, and a delete. It is not part of the note stream: boards load their
 * library once and save it on change (lib/markdown/excalidraw/library.ts).
 */
import { z } from 'zod'
import { Hono } from 'hono'
import type { AppBindings } from '../env'
import { boardLibraryName } from '../board-library/keys'
import { listBoardLibraries, readBoardLibrary, removeBoardLibrary, writeBoardLibrary } from '../board-library/store'
import { JSON_BODY_LIMITS, readJsonValidated } from '../lib/request'
import { requireAuth } from '../middleware/auth'

export const boardLibraryRoutes = new Hono<AppBindings>()

boardLibraryRoutes.use('*', requireAuth)

const saveSchema = z.object({
  name: z.string(),
  items: z.string(),
})

boardLibraryRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const requested = c.req.query('name')
  if (requested === undefined) return c.json({ libraries: await listBoardLibraries(c.env.DB, userId) })
  const name = boardLibraryName(requested)
  return c.json(await readBoardLibrary(c.env, c.env.DB, userId, name))
})

boardLibraryRoutes.put('/', async (c) => {
  const userId = c.get('userId')
  const body = await readJsonValidated(c, saveSchema, JSON_BODY_LIMITS.boardLibrary)
  const name = boardLibraryName(body.name)
  return c.json(await writeBoardLibrary(c.env, c.env.DB, userId, name, body.items))
})

boardLibraryRoutes.delete('/', async (c) => {
  const userId = c.get('userId')
  const name = boardLibraryName(c.req.query('name'))
  return c.json({ removed: await removeBoardLibrary(c.env, c.env.DB, userId, name) })
})
