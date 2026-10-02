import { infoFlag, infoOption, infoTokens } from './info-string'

/**
 * What a `::: table` container lets the note say about the table it wraps. A markdown table has no
 * info string of its own, so the container is where the settings live — and every toolbar edit is a
 * source edit of that one header line.
 */

export type TableDensity = 'cozy' | 'compact'
export type TableFrames = 'all' | 'rows' | 'none'

export interface TableOptions {
  density: TableDensity
  zebra: boolean
  frames: TableFrames
}

export const TABLE_OPTION_DEFAULTS: TableOptions = { density: 'cozy', zebra: false, frames: 'all' }

const DENSITIES: Record<string, TableDensity> = { compact: 'compact', tight: 'compact', cozy: 'cozy', comfortable: 'cozy' }
const FRAMES: Record<string, TableFrames> = { all: 'all', box: 'all', rows: 'rows', lines: 'rows', none: 'none', plain: 'none' }

export function parseTableOptions(info: string): TableOptions {
  const options: TableOptions = { ...TABLE_OPTION_DEFAULTS }
  for (const token of infoTokens(info)) {
    const option = infoOption(token)
    const flag = infoFlag(token)
    const density = DENSITIES[option?.key === 'density' ? option.value.toLowerCase() : flag]
    if (density) {
      options.density = density
      continue
    }
    if (option?.key === 'zebra') {
      options.zebra = !/^(false|0|off)$/i.test(option.value)
      continue
    }
    if (flag === 'zebra' || flag === 'striped') {
      options.zebra = true
      continue
    }
    const frames = FRAMES[option?.key === 'frames' ? option.value.toLowerCase() : flag]
    if (frames) options.frames = frames
  }
  return options
}

/** The canonical trailing tokens, in the order the settings panel offers them; defaults are dropped. */
export function formatTableOptions(options: TableOptions): string {
  const parts: string[] = []
  if (options.density !== TABLE_OPTION_DEFAULTS.density) parts.push(`density=${options.density}`)
  if (options.zebra) parts.push('zebra')
  if (options.frames !== TABLE_OPTION_DEFAULTS.frames) parts.push(`frames=${options.frames}`)
  return parts.join(' ')
}
