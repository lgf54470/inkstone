import { AwsClient } from 'aws4fetch'
import { truncateText } from '@shared/text-utils'
import type { S3Config } from '@shared/types'
import type { Snapshot } from './snapshot'
import { cancelStreamBestEffort } from '../lib/streams'
import { backupArchivePath, createBackupArchive } from './archive'
import {
  BACKUP_USER_AGENT,
  friendlyError,
  readResponseBytesWithinLimit,
  type DeliverResult,
} from './common'

export { s3Test } from './s3-test'
import {
  normalizeBackupPrefix,
  normalizeS3Region,
  parseBackupEndpoint,
  validateS3Bucket,
} from './validation'

export interface S3Secret {
  accessKeyId?: string
  secretAccessKey?: string
}

const S3_MULTIPART_PART_BYTES = 8 * 1024 * 1024
const S3_MULTIPART_PARTS_MAX = 10_000

export function client(secret: S3Secret, config: S3Config): AwsClient {
  if (!secret.accessKeyId || !secret.secretAccessKey) {
    throw new Error('Access Key or Secret Key is missing')
  }
  return new AwsClient({
    accessKeyId: secret.accessKeyId,
    secretAccessKey: secret.secretAccessKey,
    region: normalizeS3Region(config.region),
    service: 's3',
    retries: 2,
    initRetryMs: 100,
  })
}


export function objectUrl(config: S3Config, key: string): string {
  const region = normalizeS3Region(config.region)
  const raw = config.endpoint?.trim() || `https://s3.${region === 'auto' ? 'us-east-1' : region}.amazonaws.com`
  const endpoint = parseBackupEndpoint(raw, 'Endpoint')
  const bucket = validateS3Bucket(config.bucket ?? '', config.pathStyle === true)
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  if (config.pathStyle) {
    const prefix = endpoint.pathname.replace(/\/+$/, '')
    return `${endpoint.origin}${prefix}/${encodeURIComponent(bucket)}/${encodedKey}`
  }
  const prefix = endpoint.pathname.replace(/\/+$/, '')
  return `${endpoint.protocol}//${bucket}.${endpoint.host}${prefix}/${encodedKey}`
}

export function joinKey(...parts: (string | undefined)[]): string {
  return parts
    .filter((p): p is string => Boolean(p && p.trim()))
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')
}

export async function s3Deliver(
  config: S3Config,
  secret: S3Secret,
  snapshot: Snapshot,
  signal?: AbortSignal,
): Promise<DeliverResult> {
  const aws = client(secret, config)
  const prefix = normalizeBackupPrefix(config.prefix ?? '')
  const key = joinKey(prefix, backupArchivePath(snapshot))
  const archive = createBackupArchive(snapshot)
  if (await s3ArchiveMatches(aws, config, key, archive.byteLengthNumber, snapshot.stamp, signal)) {
    await cancelStreamBestEffort(archive.stream)
    return { files: 1, bytes: archive.byteLengthNumber }
  }

  if (archive.byteLengthNumber <= S3_MULTIPART_PART_BYTES) {
    const body = await readStreamExactly(archive.stream, archive.byteLengthNumber)
    await putArchive(aws, config, key, body, snapshot.stamp, signal)
  } else {
    await multipartUpload(
      aws,
      config,
      key,
      archive.stream,
      archive.byteLengthNumber,
      snapshot.stamp,
      signal,
    )
  }

  return { files: 1, bytes: archive.byteLengthNumber }
}

async function s3ArchiveMatches(
  aws: AwsClient,
  config: S3Config,
  key: string,
  expectedBytes: number,
  stamp: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const response = await aws.fetch(objectUrl(config, key), {
    method: 'HEAD',
    signal,
    redirect: 'manual',
  })
  if (response.status === 403 || response.status === 404) {
    await cancelStreamBestEffort(response.body)
    return false
  }
  if (!response.ok) throw new Error(await describeError(response, key))
  const size = Number(response.headers.get('Content-Length'))
  const storedStamp = response.headers.get('X-Amz-Meta-Inkstone-Snapshot')
  await cancelStreamBestEffort(response.body)
  return size === expectedBytes && (!storedStamp || storedStamp === stamp)
}

function archiveHeaders(stamp: string): Record<string, string> {
  return {
    'Content-Type': 'application/zip',
    'X-Amz-Meta-Inkstone-Backup': 'markdown-v3',
    'X-Amz-Meta-Inkstone-Snapshot': stamp,
    'User-Agent': BACKUP_USER_AGENT,
  }
}

async function putArchive(
  aws: AwsClient,
  config: S3Config,
  key: string,
  body: Uint8Array,
  stamp: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await aws.fetch(objectUrl(config, key), {
    method: 'PUT',
    body: body as unknown as BodyInit,
    headers: archiveHeaders(stamp),
    signal,
    redirect: 'manual',
  })
  if (!response.ok) throw new Error(await describeError(response, key))
  await cancelStreamBestEffort(response.body)
}

interface UploadedPart {
  partNumber: number
  etag: string
}

async function multipartUpload(
  aws: AwsClient,
  config: S3Config,
  key: string,
  stream: ReadableStream<Uint8Array>,
  expectedBytes: number,
  stamp: string,
  signal?: AbortSignal,
): Promise<void> {
  let uploadId: string | null = null
  try {
    uploadId = await startMultipartUpload(aws, config, key, stamp, signal)

    const parts: UploadedPart[] = []
    let uploadedBytes = 0
    for await (const body of streamParts(stream, S3_MULTIPART_PART_BYTES)) {
      const partNumber = parts.length + 1
      if (partNumber > S3_MULTIPART_PARTS_MAX) {
        throw new Error(`The backup needs more than ${S3_MULTIPART_PARTS_MAX} S3 parts`)
      }
      const etag = await uploadMultipartPart(aws, config, key, uploadId, partNumber, body, signal)
      parts.push({ partNumber, etag })
      uploadedBytes += body.byteLength
    }
    if (!parts.length) throw new Error(`The backup ZIP was empty (${key})`)
    if (uploadedBytes !== expectedBytes) throw new Error('The generated backup ZIP size changed')

    await completeMultipartUpload(aws, config, key, uploadId, parts, signal)
    uploadId = null
  } finally {
    if (uploadId) await abortMultipart(aws, config, key, uploadId)
  }
}

async function startMultipartUpload(
  aws: AwsClient,
  config: S3Config,
  key: string,
  stamp: string,
  signal?: AbortSignal,
): Promise<string> {
  const started = await aws.fetch(multipartUrl(config, key, { uploads: null }), {
    method: 'POST',
    headers: archiveHeaders(stamp),
    signal,
    redirect: 'manual',
  })
  if (!started.ok) throw new Error(await describeError(started, key))
  const startBody = await responseTextWithinLimit(started, 64 * 1024)
  const uploadId = decodeXmlText(/<UploadId>([\s\S]*?)<\/UploadId>/i.exec(startBody)?.[1] ?? '')
  if (!uploadId) throw new Error(`S3 did not return a multipart upload ID (${key})`)
  return uploadId
}

async function uploadMultipartPart(
  aws: AwsClient,
  config: S3Config,
  key: string,
  uploadId: string,
  partNumber: number,
  body: Uint8Array,
  signal?: AbortSignal,
): Promise<string> {
  const uploaded = await aws.fetch(multipartUrl(config, key, {
    partNumber: String(partNumber),
    uploadId,
  }), {
    method: 'PUT',
    body: body as unknown as BodyInit,
    headers: { 'User-Agent': BACKUP_USER_AGENT },
    signal,
    redirect: 'manual',
  })
  if (!uploaded.ok) throw new Error(await describeError(uploaded, key))
  const etag = uploaded.headers.get('ETag')
  await cancelStreamBestEffort(uploaded.body)
  if (!etag) throw new Error(`S3 did not return an ETag for part ${partNumber} (${key})`)
  return etag
}

async function completeMultipartUpload(
  aws: AwsClient,
  config: S3Config,
  key: string,
  uploadId: string,
  parts: UploadedPart[],
  signal?: AbortSignal,
): Promise<void> {
  const completeBody = new TextEncoder().encode(
    `<CompleteMultipartUpload>${parts.map((part) =>
      `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${escapeXml(part.etag)}</ETag></Part>`
    ).join('')}</CompleteMultipartUpload>`,
  )
  const completed = await aws.fetch(multipartUrl(config, key, { uploadId }), {
    method: 'POST',
    body: completeBody as unknown as BodyInit,
    headers: { 'Content-Type': 'application/xml', 'User-Agent': BACKUP_USER_AGENT },
    signal,
    redirect: 'manual',
  })
  const completedBody = await responseTextWithinLimit(completed, 64 * 1024)
  if (!completed.ok || /<Error(?:\s|>)/i.test(completedBody)) {
    const detail = /<Message>([\s\S]*?)<\/Message>/i.exec(completedBody)?.[1]
    throw new Error(
      detail
        ? `S3 could not complete the multipart upload: ${decodeXmlText(detail)} (${key})`
        : `S3 could not complete the multipart upload: HTTP ${completed.status} (${key})`,
    )
  }
}

async function abortMultipart(
  aws: AwsClient,
  config: S3Config,
  key: string,
  uploadId: string,
): Promise<void> {
  try {
    const response = await aws.fetch(multipartUrl(config, key, { uploadId }), {
      method: 'DELETE',
      headers: { 'User-Agent': BACKUP_USER_AGENT },
      signal: AbortSignal.timeout(10_000),
      redirect: 'manual',
    })
    await cancelStreamBestEffort(response.body)
    if (!response.ok && response.status !== 404) {
      console.warn(`[inkstone] S3 multipart cleanup failed: HTTP ${response.status} (${key})`)
    }
  } catch (error) {
    console.warn('[inkstone] S3 multipart cleanup failed:', friendlyError(error))
  }
}

function multipartUrl(
  config: S3Config,
  key: string,
  query: Record<string, string | null>,
): string {
  const url = new URL(objectUrl(config, key))
  const entries = Object.entries(query)
  if (entries.length === 1 && entries[0]![1] === null) {
    url.search = entries[0]![0]
  } else {
    for (const [name, value] of entries) {
      if (value !== null) url.searchParams.set(name, value)
    }
  }
  return url.toString()
}

async function* streamParts(
  stream: ReadableStream<Uint8Array>,
  partBytes: number,
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader()
  let carry = new Uint8Array(partBytes)
  let carryUsed = 0
  let hasCompleted = false
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const filled = fillPartBuffer(value, partBytes, carry, carryUsed)
      for (const part of filled.parts) yield part
      carry = filled.carry
      carryUsed = filled.carryUsed
    }
    if (carryUsed) yield carry.slice(0, carryUsed)
    hasCompleted = true
  } finally {
    if (!hasCompleted) await cancelStreamBestEffort(reader)
    reader.releaseLock()
  }
}

function fillPartBuffer(
  value: Uint8Array,
  partBytes: number,
  carry: Uint8Array<ArrayBuffer>,
  carryUsed: number,
): { parts: Uint8Array[]; carry: Uint8Array<ArrayBuffer>; carryUsed: number } {
  const parts: Uint8Array[] = []
  let buffer = carry
  let used = carryUsed
  let offset = 0
  while (offset < value.byteLength) {
    const copied = Math.min(partBytes - used, value.byteLength - offset)
    buffer.set(value.subarray(offset, offset + copied), used)
    used += copied
    offset += copied
    if (used === partBytes) {
      parts.push(buffer)
      buffer = new Uint8Array(partBytes)
      used = 0
    }
  }
  return { parts, carry: buffer, carryUsed: used }
}

async function readStreamExactly(
  stream: ReadableStream<Uint8Array>,
  expectedBytes: number,
): Promise<Uint8Array> {
  const output = new Uint8Array(expectedBytes)
  const reader = stream.getReader()
  let offset = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (offset + value.byteLength > output.byteLength) {
        throw new Error('The generated backup ZIP exceeded its predicted size')
      }
      output.set(value, offset)
      offset += value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  if (offset !== expectedBytes) throw new Error('The generated backup ZIP size changed')
  return output
}

async function responseTextWithinLimit(response: Response, limit: number): Promise<string> {
  return new TextDecoder().decode(await readResponseBytesWithinLimit(response, limit))
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function describeError(res: Response, key: string): Promise<string> {
  let detail = ''
  try {
    const text = truncateText(
      new TextDecoder().decode(await readResponseBytesWithinLimit(res, 4096)),
      800,
    )
    detail = /<Message>([\s\S]*?)<\/Message>/.exec(text)?.[1] ?? text.replace(/<[^>]+>/g, ' ').trim()
  } catch { /* Best-effort: an unreadable error body falls back to the generic hints below. */ }

  const hints: Record<number, string> = {
    301: 'The bucket region does not match. Check region and endpoint',
    400: 'The request was rejected. Check region and endpoint',
    403: 'The key is invalid or lacks write access to this bucket',
    404: 'The bucket does not exist or the endpoint is incorrect',
    501: 'The service does not support this operation. Enable path-style access',
  }
  const hint = hints[res.status]
  return `HTTP ${res.status}${hint ? ` · ${hint}` : ''}${detail ? ` · ${detail}` : ''} (${key})`
}


