// A WebDAV row is only a reference: its bytes live on somebody else's server and its
// size is whatever that server answered, so charging it to the local quota would let a
// remote host — or a stale stat — lock the account out of its own uploads. Only tracks
// this deployment actually stores count.
const REMOTE_SOURCE = 'webdav'

export function isStoredMusicSource(source: string): boolean {
  return source !== REMOTE_SOURCE
}

export async function storedMusicBytes(db: D1Database, userId: string): Promise<number> {
  const row = await db.prepare(
    `SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM music_tracks WHERE user_id = ?1 AND source <> ?2`,
  ).bind(userId, REMOTE_SOURCE).first<{ bytes: number }>()
  return row?.bytes ?? 0
}
