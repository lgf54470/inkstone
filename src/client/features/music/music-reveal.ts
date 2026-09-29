// Row actions on a pointer that can hover are revealed by the row they belong to; on a coarse pointer
// there is no hover to reveal anything, so they are drawn outright.
//
// The breakpoint is not the question: a tablet is wider than `md` and still cannot hover, so the
// `md:`-gated form of this rule left those screens with actions nobody could see or press — including
// the row menu, which is the only way to reach the actions the row itself does not carry. Tailwind's
// `pointer-coarse` variant asks about the input device, which is the thing that actually decides.
//
// `!important` is scoped to these two properties and exists to override the same rule's `md:opacity-0`
// / `md:pointer-events-none` utilities, which are what hide the controls on a mouse; the kanban cards
// carry the same escape hatch for the same reason.
export const REVEAL_ON_COARSE_POINTER = 'pointer-coarse:!opacity-100 pointer-coarse:!pointer-events-auto'
