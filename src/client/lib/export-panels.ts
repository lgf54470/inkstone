import { EXPORT_PALETTE } from './export-palette'

/**
 * The `:::` panel family in the self-contained HTML/PDF export.
 *
 * These rules sit apart from `EXPORT_CSS` because that template is already at the file-size ceiling the
 * repository enforces, and because the family is a closed set of blocks: everything it needs to print
 * is here, and nothing else reaches into it. The exported document is standalone, so it cannot read the
 * app's design tokens and every colour comes from `EXPORT_PALETTE`.
 */
export const PANEL_EXPORT_CSS = `
.markdown-align { margin: 1.2em 0; }
.markdown-align > :first-child { margin-top: 0; }
.markdown-align > :last-child { margin-bottom: 0; }
.markdown-align[data-align="left"] { text-align: left; }
.markdown-align[data-align="center"] { text-align: center; }
.markdown-align[data-align="right"] { text-align: right; }
.markdown-align[data-align="justify"] { text-align: justify; }

.markdown-cols { display: grid; align-items: start; gap: 1em; margin: 1.2em 0; grid-template-columns: minmax(0, 1fr); }
.markdown-cols[data-cols="2"] { grid-template-columns: var(--panel-cols-tracks, repeat(2, minmax(0, 1fr))); }
.markdown-cols[data-cols="3"] { grid-template-columns: var(--panel-cols-tracks, repeat(3, minmax(0, 1fr))); }
.markdown-cols[data-cols="4"] { grid-template-columns: var(--panel-cols-tracks, repeat(4, minmax(0, 1fr))); }
.markdown-cols[data-cols="5"] { grid-template-columns: var(--panel-cols-tracks, repeat(5, minmax(0, 1fr))); }
.markdown-cols[data-cols="6"] { grid-template-columns: var(--panel-cols-tracks, repeat(6, minmax(0, 1fr))); }
.markdown-cols[data-cols-gap="narrow"] { gap: 0.5em; }
.markdown-cols[data-cols-gap="wide"] { gap: 1.75em; }
.markdown-col { min-width: 0; }
.markdown-col > :first-child { margin-top: 0; }
.markdown-col > :last-child { margin-bottom: 0; }
.markdown-cols[data-cols-divider] > .markdown-col + .markdown-col { border-left: 1px solid ${EXPORT_PALETTE.ink200}; padding-left: 0.5em; margin-left: -0.5em; }
.markdown-cols[data-cols-align="left"] .markdown-col { text-align: left; }
.markdown-cols[data-cols-align="center"] .markdown-col { text-align: center; }
.markdown-cols[data-cols-align="right"] .markdown-col { text-align: right; }
.markdown-cols[data-cols-align="justify"] .markdown-col { text-align: justify; }

.markdown-timeline { margin: 1.2em 0; padding: 0; list-style: none; }
.markdown-timeline-item { position: relative; padding: 0 0 0.9em 1.5em; border-left: 1px solid ${EXPORT_PALETTE.ink200}; break-inside: avoid; }
.markdown-timeline-item:last-child { padding-bottom: 0; border-left-color: transparent; }
.markdown-timeline-node { position: absolute; left: -4px; top: 0.34em; width: 8px; height: 8px; box-sizing: border-box; border-radius: 50%; border: 1px solid ${EXPORT_PALETTE.ink400}; background: ${EXPORT_PALETTE.white}; }
.markdown-timeline-item[data-status="done"] .markdown-timeline-node { background: ${EXPORT_PALETTE.emerald500}; border-color: ${EXPORT_PALETTE.emerald500}; }
.markdown-timeline-item[data-status="doing"] .markdown-timeline-node { background: ${EXPORT_PALETTE.amber500}; border-color: ${EXPORT_PALETTE.amber500}; }
.markdown-timeline-item[data-status="error"] .markdown-timeline-node { background: ${EXPORT_PALETTE.red500}; border-color: ${EXPORT_PALETTE.red500}; }
.markdown-timeline-item[data-status="milestone"] .markdown-timeline-node { background: ${EXPORT_PALETTE.blue500}; border-color: ${EXPORT_PALETTE.blue500}; border-radius: 2px; transform: rotate(45deg); }
.markdown-timeline-body > :last-child { margin-bottom: 0; }
.markdown-timeline-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2em 0.5em; }
.markdown-timeline-time { font-size: 0.82em; color: ${EXPORT_PALETTE.ink500}; }
.markdown-timeline-title { font-weight: 600; color: ${EXPORT_PALETTE.ink900}; }
.markdown-timeline-status { font-size: 0.72em; color: ${EXPORT_PALETTE.ink500}; border: 1px solid ${EXPORT_PALETTE.ink200}; border-radius: 999px; padding: 0 0.4em; }
`
