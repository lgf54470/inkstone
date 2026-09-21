/**
 * How long a visitor's visits may be apart and still count as one sitting (ADR-0003).
 *
 * It lives in the shared layer because it is a product rule rather than an implementation choice:
 * the worker derives sessions with it, the demo mode folds its sample rows with it, and the copy
 * that explains a session quotes the same 30 minutes. It is deliberately not the view-dedupe window
 * (`VIEW_DEDUPE_WINDOW_MS` in the worker's analytics module), even though the two numbers are equal
 * today: one answers "don't count this view twice", the other "was this the same sitting", and
 * binding them would make a change to either silently change the other's meaning.
 */
export const SESSION_GAP_MS = 30 * 60 * 1000
