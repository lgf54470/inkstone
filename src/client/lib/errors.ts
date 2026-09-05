export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error == null) return ''
  return String(error)
}