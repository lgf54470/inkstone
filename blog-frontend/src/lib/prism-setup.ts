import Prism from 'prismjs'

// In Cloudflare Workers and ESM environments, Prism language definition files
// expect Prism to exist on the global scope (globalThis).
if (typeof globalThis !== 'undefined') {
  ;(globalThis as any).Prism = Prism
}

export default Prism
