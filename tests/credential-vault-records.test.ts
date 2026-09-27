import { describe, expect, it } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'
import { resolveAlistServer } from '../src/worker/routes/music/alist'
import { decryptSecret, encryptSecret } from '../src/worker/lib/crypto'
import { newId } from '../src/worker/lib/id'
import { MUSIC_TABLE_STATEMENTS } from '../src/worker/db/schema/music'
import { createD1Database, runSql } from './d1-harness'

/**
 * The vault is two halves that have to agree about the *shape* of what goes in: `encryptSecret`
 * writes whatever the caller hands it, and `decryptSecret` only hands back a value that still looks
 * like one of the records the app stores. That second check is what keeps a stray blob from coming
 * back as a credential — and it is also what breaks a consumer whose record names a field the list
 * does not have.
 *
 * Alist was exactly that consumer: it stored `{ token }` from the day it shipped, the record check
 * only allowed `password` / `accessKeyId` / `secretAccessKey`, so every Alist resolve answered
 * "the token is unreadable" — browse, search, import and streaming of Alist rows were all dead, and
 * no test noticed because none of them round-tripped through the vault. The rows already in the
 * database are encrypted with that field name, so the list is the half that has to accept it.
 *
 * Each case below is one shape a route actually stores: fix the list, not the writer, and pin the
 * shapes so the next consumer cannot add a fourth silently.
 */
const SCOPE = newId()

// A stand-in for the vault Durable Object: `/encrypt` answers a ciphertext, `/decrypt` answers the
// value back. Both halves of the contract are exercised by the pair of calls below.
function vault(): unknown {
  return {
    idFromName: () => 'vault-id',
    get: () => ({
      fetch: async (url: string, init: { body?: string }) => {
        const body = JSON.parse(String(init.body)) as { value?: unknown; ciphertext?: string }
        const answer = url.endsWith('/encrypt')
          ? { ciphertext: JSON.stringify(body.value) }
          : { value: JSON.parse(String(body.ciphertext)) }
        return new Response(JSON.stringify(answer), { status: 200 })
      },
    }),
  }
}

const env = { CREDENTIAL_VAULT: vault() } as never

async function roundTrip(value: unknown): Promise<unknown> {
  const stored = await encryptSecret(env, SCOPE, value)
  return decryptSecret(env, SCOPE, stored)
}

describe('credential record shapes (FB-M17)', () => {
  it('keeps a WebDAV target, whose only secret is the password', async () => {
    expect(await roundTrip({ password: 'pw' })).toEqual({ password: 'pw' })
  })

  it('keeps an S3 target, which needs both keys', async () => {
    const keys = { accessKeyId: 'AKIA', secretAccessKey: 'shh' }
    expect(await roundTrip(keys)).toEqual(keys)
  })

  it('keeps the token an Alist server stores', async () => {
    expect(await roundTrip({ token: 'alist-token' })).toEqual({ token: 'alist-token' })
  })

  it('still refuses a value that is not a credential record at all', async () => {
    // The list is a shape check, not a rubber stamp: an empty record and a record carrying an
    // unexpected field are both reported as unreadable rather than handed back.
    expect(await roundTrip({ note: 'not a credential' })).toBeNull()
    expect(await roundTrip({ password: 'pw', extra: 'x' })).toBeNull()
  })
})

// The helper round-trip above is the mechanism; this is the symptom the reader saw. A registered
// Alist server answered "the token is unreadable" on every browse, search and play, because the
// resolver decrypts through the same check.
describe('a registered Alist server resolves (FB-M17)', () => {
  it('hands the browse path the token the row was created with', async () => {
    const db = createD1Database()
    for (const statement of MUSIC_TABLE_STATEMENTS) await runSql(db, statement)
    const id = newId()
    const stored = await encryptSecret(env, id, { token: 'alist-token' })
    await runSql(
      db,
      `INSERT INTO music_alist_servers (id, user_id, name, url, root_path, secret, created_at, updated_at)
       VALUES (?1, 'user-1', 'Home', 'https://alist.example.com', '/music', ?2, 1, 1)`,
      id, stored,
    )
    const resolved = await resolveAlistServer(
      { DB: db as unknown as D1Database, CREDENTIAL_VAULT: vault() } as never,
      'user-1', id,
    )
    expect(resolved.token).toBe('alist-token')
    expect(resolved.rootPath).toBe('/music')
  })
})
