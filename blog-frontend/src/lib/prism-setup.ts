import Prism from 'prismjs'

// The blog only highlights explicitly, server-side (see ./prism.ts): the SSR
// renderer wraps every line itself and those spans and line numbers must reach
// the browser intact. Prism core otherwise schedules a DOMContentLoaded
// highlightAll in any bundle that reaches a browser, which repaints every
// code block and strips the server-rendered .line wrappers.
Prism.manual = true

// In Cloudflare Workers and ESM environments, Prism language definition files
// expect Prism to exist on the global scope (globalThis).
if (typeof globalThis !== 'undefined') {
  ;(globalThis as typeof globalThis & { Prism: typeof Prism }).Prism = Prism
}

export default Prism
