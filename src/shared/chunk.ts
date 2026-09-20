// D1 binds at most 100 parameters per statement, and a list of ids is the tail of the bind list:
// one statement per LIMITS.musicSqlIdChunkMax ids, executed in a single batch, is what keeps a
// bulk write to one round trip instead of answering "too many SQL variables" as a 500. The size
// is required rather than defaulted, because the request cap the client splits on is a different
// number for a different reason and a silent default would let the two drift apart.
export function chunkIds<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size))
  return chunks
}
