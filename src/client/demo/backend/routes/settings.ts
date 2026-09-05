import { Hono } from 'hono'
import type { DemoState } from '../../state'
import { APP_VERSION, mergeSettingsPatch } from '@shared/constants'
import { extractWikiLinks } from '@shared/markdown-utils'
import { listTags } from '../../state'
import { jsonBody } from '../helpers/info'

export function registerSettingsRoutes(app: Hono, state: DemoState): void {
  app.get('/api/settings', (c) => c.json(state.settings))
  app.put('/api/settings', async (c) => {
    state.settings = mergeSettingsPatch(state.settings, await jsonBody(c.req.raw))
    return c.json(state.settings)
  })
  app.get('/api/settings/stats', (c) => {
    const tags = listTags(state)
    const notes = [...state.notes.values()]
    return c.json({
      notes: notes.filter((note) => note.deletedAt === null).length,
      folders: state.folders.size,
      tags: tags.length,
      links: notes.reduce((total, note) => total + extractWikiLinks(note.content).length, 0),
      words: notes.reduce((total, note) => total + note.wordCount, 0),
      versions: [...state.versions.values()].reduce((total, versions) => total + versions.length, 0),
      attachments: state.attachments.size,
      attachmentBytes: [...state.attachments.values()].reduce((total, item) => total + item.meta.size, 0),
      trashed: notes.filter((note) => note.deletedAt !== null).length,
    })
  })

  app.get('/api/update', (c) => c.json({
    currentVersion: APP_VERSION,
    latestVersion: null,
    updateUrl: null,
    checkedAt: null,
    status: 'unavailable' as const,
  }))
}
