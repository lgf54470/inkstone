import type { McpServer, ServerContext } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { Env } from '../../env';
import { ApiError } from '../../lib/errors';
import { isValidId } from '../../lib/id';
import { getMcpPreferences, MCP_SCOPES } from '../settings';
import { createMcpNote } from '../writes';
import type { LibraryContext } from '../library/types';
import type { McpWriteContext } from '../writes';

export interface McpAuthProps {
  userId: string
  role: 'owner' | 'member'
  scopes: string[]
}

export interface InkstoneMcpServerOptions {
  env: Env
  auth: McpAuthProps
  origin: string
  ftsEnabled: boolean
  executionCtx: ExecutionContext
}


export const generalOutputSchema = z.object({ data: z.record(z.string(), z.unknown()) })
export const operationId = z.string().min(8).max(128).describe('Stable UUID or unique request key; reuse only for an exact retry')
export const noteId = z.string().refine(isValidId, 'Invalid Inkstone note id')
export const expectedRev = z.number().int().positive().describe('Current note rev returned by read_note or fetch')


export interface McpToolCtx {
  server: McpServer
  options: InkstoneMcpServerOptions
  writes: McpWriteContext
  library: LibraryContext
}

export async function customTool(
  ctx: ServerContext,
  options: InkstoneMcpServerOptions,
  callback: () => Promise<unknown>,
) {
  return safeTool(async () => {
    requireScope(ctx, options.auth, MCP_SCOPES.read)
    const value = await callback()
    return structuredData(value)
  })
}

export async function writeTool(
  ctx: ServerContext,
  options: InkstoneMcpServerOptions,
  scope: string,
  callback: () => Promise<unknown>,
) {
  return safeTool(async () => {
    requireScope(ctx, options.auth, scope)
    const preferences = await getMcpPreferences(options.env.DB, options.auth.userId)
    if (scope === MCP_SCOPES.write && !preferences.writeEnabled) {
      throw ApiError.forbidden('MCP writes are disabled in Inkstone settings')
    }
    if (scope === MCP_SCOPES.trash && !preferences.trashEnabled) {
      throw ApiError.forbidden('MCP trash access is disabled in Inkstone settings')
    }
    return structuredData(await callback())
  })
}

export function requireScope(ctx: ServerContext, fallback: McpAuthProps, required: string): void {
  const scopes = ctx.http?.authInfo?.scopes?.length ? ctx.http.authInfo.scopes : fallback.scopes
  if (!scopes.includes(required)) throw ApiError.forbidden(`OAuth scope required: ${required}`)
}

export async function safeTool(callback: () => Promise<ReturnType<typeof structured> | ReturnType<typeof structuredData>>) {
  try {
    return await callback()
  } catch (error) {
    const body = toolError(error)
    return {
      isError: true as const,
      content: [{ type: 'text' as const, text: JSON.stringify(body) }],
    }
  }
}

export function structured<T extends Record<string, unknown>>(value: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: value,
  }
}

export function structuredData(value: unknown) {
  const data = isRecord(value) ? value : { value }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    structuredContent: { data },
  }
}

export function noteResult(note: Awaited<ReturnType<typeof createMcpNote>>, origin: string): Record<string, unknown> {
  return {
    note: {
      id: note.id,
      title: note.title,
      url: `${origin.replace(/\/$/, '')}/n/${encodeURIComponent(note.id)}`,
      rev: note.rev,
      excerpt: note.excerpt,
      folder_id: note.folderId,
      starred: note.isStarred,
      archived: note.isArchived,
      deleted_at: note.deletedAt ? new Date(note.deletedAt).toISOString() : null,
      updated_at: new Date(note.updatedAt).toISOString(),
    },
  }
}

export function readOnlyAnnotations() {
  return { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}

export function writeAnnotations(idempotent: boolean) {
  return { readOnlyHint: false, destructiveHint: false, idempotentHint: idempotent, openWorldHint: false }
}

export function toolError(error: unknown): Record<string, unknown> {
  if (error instanceof ApiError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        status: error.status,
        ...(error.details ? { details: error.details } : {}),
      },
    }
  }
  console.error('[inkstone] MCP tool failed:', error)
  return { error: { code: 'internal', message: 'Inkstone could not complete the tool call' } }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
