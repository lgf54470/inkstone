// A WebDAV row is only a reference: its bytes live on somebody else's server and its
// size is whatever that server answered, so charging it to the local quota would let a
// remote host — or a stale stat — lock the account out of its own uploads. Only tracks
// this deployment actually stores count.
const REMOTE_SOURCES = ['webdav', 'alist']

export function isStoredMusicSource(source: string): boolean {
  return !REMOTE_SOURCES.includes(source)
}

export async function storedMusicBytes(db: D1Database, userId: string): Promise<number> {
  const row = await db.prepare(
    `SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM music_tracks WHERE user_id = ?1 AND source NOT IN (${REMOTE_SOURCES.map((_, index) => `?${index + 2}`).join(', ')})`,
  ).bind(userId, ...REMOTE_SOURCES).first<{ bytes: number }>()
  return row?.bytes ?? 0
}
