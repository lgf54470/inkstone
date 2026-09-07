/**
 * Widens a binary body to `BodyInit` for the shared DOM/undici request types.
 *
 * Workers and undici accept `Uint8Array` and `ReadableStream` bodies at
 * runtime, but the DOM `BodyInit` union models them through `BufferSource`
 * parameterizations that reject the exact `Uint8Array`/stream shapes used
 * here, so every backup call site would otherwise repeat a double-cast. This
 * helper is the single point where that widening happens.
 */
export function asBodyInit(body: Uint8Array | ReadableStream<Uint8Array>): BodyInit {
  return body as BodyInit
}
