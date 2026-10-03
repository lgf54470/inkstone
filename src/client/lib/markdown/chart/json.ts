/**
 * The JSON half of a ```chart body. Chart blocks carry tolerate formatting: comment and `**` markers
 * stripped and trailing commas allowed before the strict parse is retried, because a config typed
 * out of a documentation page arrives with both.
 */

function cleanChartConfig(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    .replace(/,\s*([\]}])/g, '$1')
    .replace(/\*\*/g, '')
}

export function parseChartJson(raw: string): Record<string, unknown> {
  let initialErr: unknown = null
  try {
    return JSON.parse(raw)
  }
  catch (err) {
    initialErr = err
  }
  try {
    return JSON.parse(cleanChartConfig(raw))
  }
  catch {
    throw initialErr
  }
}
