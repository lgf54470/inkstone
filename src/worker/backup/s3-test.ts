import type { AwsClient } from 'aws4fetch'
import type { S3Config, TestConnectionResult } from '@shared/types'
import { cancelStreamBestEffort } from '../lib/streams'
import { BACKUP_USER_AGENT, bytesEqual, friendlyError, readResponseBytesWithinLimit } from './common'
import { normalizeBackupPrefix } from './validation'
import { client, describeError, joinKey, objectUrl, type S3Secret } from './s3'

export async function s3Test(
  config: S3Config,
  secret: S3Secret,
  signal?: AbortSignal,
): Promise<TestConnectionResult> {
  const started = Date.now()
  try {
    if (!config.bucket?.trim()) return { ok: false, message: 'Enter a bucket name' }
    const aws = client(secret, config)
    const key = joinKey(
      normalizeBackupPrefix(config.prefix ?? ''),
      `.inkstone-check-${crypto.randomUUID()}`,
    )
    const url = objectUrl(config, key)
    const payload = new TextEncoder().encode(`inkstone ${new Date().toISOString()}`)
    return await s3RoundTrip(aws, url, key, payload, signal, started)
  } catch (err) {
    return { ok: false, message: friendlyError(err) }
  }
}

async function s3RoundTrip(
  aws: AwsClient,
  url: string,
  key: string,
  payload: Uint8Array,
  signal: AbortSignal | undefined,
  started: number,
): Promise<TestConnectionResult> {
  let hasWritten = false
  let hasReadWriteSucceeded = false
  let primaryFailure: TestConnectionResult | null = null
  try {
    const put = await aws.fetch(url, {
      method: 'PUT',
      body: payload as unknown as BodyInit,
      headers: { 'Content-Type': 'text/plain', 'User-Agent': BACKUP_USER_AGENT },
      signal,
      redirect: 'manual',
    })
    if (!put.ok) return { ok: false, message: await describeError(put, key) }
    hasWritten = true
    await cancelStreamBestEffort(put.body)

    const get = await aws.fetch(url, { method: 'GET', signal, redirect: 'manual' })
    if (!get.ok) {
      primaryFailure = { ok: false, message: `Write succeeded but read failed: ${await describeError(get, key)}` }
      return primaryFailure
    }
    const downloaded = await readResponseBytesWithinLimit(get, 1024)
    if (!bytesEqual(downloaded, payload)) {
      primaryFailure = { ok: false, message: 'The data read after writing did not match. Check the storage gateway or proxy' }
      return primaryFailure
    }

    hasReadWriteSucceeded = true
    return {
      ok: true,
      message: 'Connection succeeded with read and write access',
      latencyMs: Date.now() - started,
    }
  } finally {
    if (hasWritten) await removeS3TestObject(aws, url, hasReadWriteSucceeded, primaryFailure)
  }
}

async function removeS3TestObject(
  aws: AwsClient,
  url: string,
  hasReadWriteSucceeded: boolean,
  primaryFailure: TestConnectionResult | null,
): Promise<void> {
  let cleanupError: Error | null = null
  try {
    const removed = await aws.fetch(url, {
      method: 'DELETE',
      signal: AbortSignal.timeout(5_000),
      redirect: 'manual',
    })
    await cancelStreamBestEffort(removed.body)
    if (!removed.ok && removed.status !== 404) {
      cleanupError = new Error(`The test file could not be removed: HTTP ${removed.status}`)
    }
  } catch (error) {
    cleanupError = new Error(`The test file could not be removed: ${friendlyError(error)}`)
  }
  if (!cleanupError) return
  if (hasReadWriteSucceeded) throw cleanupError
  if (primaryFailure) primaryFailure.message += `. ${cleanupError.message}`
  console.warn('[inkstone] S3 test object cleanup failed:', cleanupError.message)
}