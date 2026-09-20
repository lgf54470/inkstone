// D1 batch() answers with one result object per statement; these unpack them
// the way prepare().all()/.first() used to for serial reads.
export interface D1ReadResult {
  results?: unknown[]
}

export function rowsOf<T>(result: D1ReadResult | undefined): T[] {
  return (result?.results ?? []) as T[]
}

export function firstOf<T>(result: D1ReadResult | undefined): T | null {
  return rowsOf<T>(result)[0] ?? null
}
