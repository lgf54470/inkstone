import { describe, expect, it } from 'vitest'
import { DEMO_CREDENTIALS } from '../lib/runtime'
import { createDemoBackend } from './backend'

/**
 * FEA-07 in demo mode: the picker's library must back the same read/upload/delete contract the
 * worker answers, including the two refusals (a note-owned picture, a picture a live post shows).
 * It runs in the node project because the jsdom FormData rejects the File class Node hands us.
 */

type DemoBackend = ReturnType<typeof createDemoBackend>

function call(backend: DemoBackend, path: string, init?: RequestInit): Promise<Response> {
  return backend.fetch(new Request(`http://demo.local${path}`, init))
}

async function loggedInBackend(): Promise<DemoBackend> {
  const backend = createDemoBackend()
  await call(backend, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(DEMO_CREDENTIALS),
  })
  return backend
}

function mediaForm(filename: string, bytes: BlobPart, type: string): FormData {
  const form = new FormData()
  form.append('file', new File([bytes], filename, { type }))
  return form
}

function jsonInit(body: unknown, method = 'POST'): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

const PNG = new Uint8Array([137, 80, 78, 71])

describe('demo blog media library', () => {
  it('uploads and lists a picture, and refuses a file that is not one', async () => {
    const backend = await loggedInBackend()

    const uploaded = await call(backend, '/api/blog/media', { method: 'POST', body: mediaForm('cover.png', PNG, 'image/png') })
    expect(uploaded.status).toBe(201)
    const item = await uploaded.json()
    expect(item).toMatchObject({
      filename: 'cover.png',
      mime: 'image/png',
      previewUrl: `/api/files/${item.id}?preview=1`,
      publicUrl: `/api/files/${item.id}`,
    })

    const listed = await (await call(backend, '/api/blog/media')).json()
    expect(listed.media.some((entry: { id: string }) => entry.id === item.id)).toBe(true)

    const text = new TextEncoder().encode('not a picture')
    expect((await call(backend, '/api/blog/media', { method: 'POST', body: mediaForm('notes.txt', text, 'text/plain') })).status).toBe(400)
  })

  it('refuses to delete a picture a live cover shows, and deletes it once the post lets go', async () => {
    const backend = await loggedInBackend()

    const item = await (
      await call(backend, '/api/blog/media', { method: 'POST', body: mediaForm('shot.png', PNG, 'image/png') })
    ).json()
    const post = await (
      await call(backend, '/api/blog/posts', jsonInit({
        noteId: 'demo-note-media', title: 'Media Post', coverUrl: item.publicUrl, isPublished: true,
      }))
    ).json()

    const blocked = await call(backend, `/api/blog/media/${item.id}`, { method: 'DELETE' })
    expect(blocked.status).toBe(400)
    expect((await blocked.json()).error.message).toContain('Media Post')

    await call(backend, `/api/blog/posts/${post.id}`, jsonInit({ coverUrl: '' }, 'PATCH'))
    expect((await call(backend, `/api/blog/media/${item.id}`, { method: 'DELETE' })).status).toBe(200)
    const after = await (await call(backend, '/api/blog/media')).json()
    expect(after.media.some((entry: { id: string }) => entry.id === item.id)).toBe(false)
  })
})
