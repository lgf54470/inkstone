/**
 * Client-side random ID helpers. Consolidates the crypto.randomUUID fallback
 * ladder that used to be duplicated across the API layer, markdown renderer
 * and the notes store.
 */

/** Strongest available random id: randomUUID → CSPRNG hex → timestamp+random. */
export function secureRandomId(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID()
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    cryptoApi.getRandomValues(bytes)
    return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** randomUUID with a timestamp+random fallback (for write/outbox ids). */
export function randomWriteId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}