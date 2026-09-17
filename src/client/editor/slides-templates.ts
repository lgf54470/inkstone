import type { DiagramTemplate } from './diagram-templates'
import starterDeck from './starter-showcase.json'

export const BENTO_SLIDES_TEMPLATES: DiagramTemplate[] = [
  {
    id: 'json',
    labelKey: 'contextmenu.slides_json',
    code: JSON.stringify(starterDeck, null, 2),
  },
  {
    id: 'outline',
    labelKey: 'contextmenu.slides_outline',
    code: `# Bento Slides Showcase
The file is the software. One HTML file — deck, viewer and editor together.
- Local-first & offline native design
- Clean interactive preview and presentation mode
- Full two-way editing with instant sync
[bg: #0D1B2E] [transition: fade]

---

# Everything ships inside.
No cloud account. No subscription. No dependencies to break.
- your deck — JSON data
- viewer + presenter — morphs, charts, speaker view
- the editor itself — press Esc, it's right there
[bg: #F2F0EA] [transition: morph]

---

# Performance & Metrics
- Views & active edits count
- Visual distribution breakdown
[bg: #0D1B2E] [transition: slide] [notes: Presenting key analytics and metrics]`,
  },
]
