// QR codes are drawn into canvas/SVG at render time, where CSS variables
// cannot be resolved, so the two colors are absolute values instead of design
// tokens. They used to be triplicated across the share/attachments/TOTP
// modals with a divergent foreground (#111827 vs #0f172a); this module is the
// single source of truth. #0f172a (slate-900) matches the light-theme text
// color used by prose and exports.
export const QR_BG_COLOR = '#ffffff'
export const QR_FG_COLOR = '#0f172a'